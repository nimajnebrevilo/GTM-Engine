"""
Remote MCP Server for GTM Engine — Streamable HTTP transport.

This exposes the GTM Engine tools over HTTP so it can be added as a
"custom connector" in Claude.ai / Claude CoWork.

Setup:
  1. Set MCP_AUTH_TOKEN in your .env (generate one with: python3 -c "import secrets; print(secrets.token_urlsafe(48))")
  2. Run:  python3 -m gtm_agent.mcp_remote
  3. In Claude.ai → Settings → Connectors → Add custom connector:
       Name:  GTM Engine
       URL:   https://<your-host>/mcp
  4. Under Advanced settings, leave OAuth fields blank — use the
     Authorization header approach (see below).

Authentication:
  Every request must include:  Authorization: Bearer <MCP_AUTH_TOKEN>
  Requests without a valid token get 401.

  For Claude.ai connectors that don't support custom headers natively,
  you can use the OAuth Client Secret field to pass the token — the
  server accepts it from either location.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

# Bypass egress proxy for API hosts (same as mcp_server.py)
_BYPASS_HOSTS = (
    "*.supabase.co",
    "*.supabase.in",
    "api.apollo.io",
    "api.exa.ai",
    "api.prospeo.io",
    "api.millionverifier.com",
    "maps-data.p.rapidapi.com",
)
_current = os.environ.get("NO_PROXY", "")
_to_add = ",".join(h for h in _BYPASS_HOSTS if h not in _current)
if _to_add:
    new_val = f"{_current},{_to_add}" if _current else _to_add
    os.environ["NO_PROXY"] = new_val
    os.environ["no_proxy"] = new_val

import hmac
import json
import logging

from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route
from starlette.types import ASGIApp, Receive, Scope, Send

from mcp.server.fastmcp import FastMCP

from gtm_agent import engine
from gtm_agent.tools import TOOLS

logger = logging.getLogger("gtm-engine-remote")

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

AUTH_TOKEN = os.environ.get("MCP_AUTH_TOKEN", "")

if not AUTH_TOKEN:
    print(
        "WARNING: MCP_AUTH_TOKEN is not set. The server will reject ALL requests.\n"
        "Generate one with:  python3 -c \"import secrets; print(secrets.token_urlsafe(48))\"",
        file=sys.stderr,
    )


class BearerTokenMiddleware:
    """Reject requests that don't carry a valid bearer token."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Allow health-check without auth
        if scope["path"] == "/health":
            await self.app(scope, receive, send)
            return

        # If no AUTH_TOKEN configured, skip auth (authless mode for Claude CoWork)
        if not AUTH_TOKEN:
            await self.app(scope, receive, send)
            return

        # Extract token from Authorization header
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode()
        token = ""

        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:]

        if not token or not hmac.compare_digest(token, AUTH_TOKEN):
            response = JSONResponse(
                {"error": "Unauthorized — invalid or missing bearer token"},
                status_code=401,
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)


# ---------------------------------------------------------------------------
# Build the FastMCP server with all GTM tools
# ---------------------------------------------------------------------------

mcp = FastMCP(
    "gtm-engine",
    stateless_http=True,  # Claude.ai connectors are stateless
)


def _register_tool(tool_def: dict) -> None:
    """Register a GTM engine tool on the FastMCP server."""
    name = tool_def["name"]
    description = f"[GTM Engine] {tool_def['description']}"
    schema = tool_def["input_schema"]

    # Build the tool function dynamically
    async def _handler(**kwargs: object) -> str:
        return _execute(name, kwargs)

    # Give the function a proper name for FastMCP
    _handler.__name__ = f"gtm_{name}"
    _handler.__qualname__ = f"gtm_{name}"
    _handler.__doc__ = description

    mcp.tool(name=f"gtm_{name}", description=description)(_handler)


def _execute(tool_name: str, args: dict) -> str:
    """Execute a GTM engine tool (sync) and return JSON."""
    dispatch = {
        "create_client": lambda: engine.create_client(**args),
        "list_clients": lambda: engine.list_clients(),
        "get_client": lambda: engine.get_client(args["client_id"]),
        "create_campaign": lambda: engine.create_campaign(**args),
        "list_campaigns": lambda: engine.list_campaigns(args.get("client_id")),
        "create_icp": lambda: engine.create_icp(**args),
        "get_active_icp": lambda: engine.get_active_icp(args["client_id"]),
        "activate_icp": lambda: engine.activate_icp(args["icp_id"]),
        "refine_icp": lambda: engine.refine_icp(**args),
        "update_icp": lambda: engine.update_icp(args.pop("icp_id"), **args),
        "challenge_icp": lambda: engine.challenge_icp(**args),
        "search_companies": lambda: engine.search_companies(**args),
        "detect_signals": lambda: engine.detect_signals(**args),
        "build_tam": lambda: engine.build_tam(args),
        "search_people": lambda: engine.search_people(**args),
        "enrich_contact": lambda: engine.enrich_contact(**args),
        "bulk_verify_emails": lambda: engine.bulk_verify_emails(args["emails"]),
        "export_campaign": lambda: engine.export_campaign(**args),
        "get_cost_summary": lambda: engine.get_cost_summary(),
        "get_engine_status": lambda: engine.get_engine_status(),
        "preflight_check": lambda: engine.preflight_check(),
    }

    fn = dispatch.get(tool_name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    try:
        result = fn()
        return json.dumps(result, default=str)
    except engine.EngineError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        return json.dumps({"error": f"{type(e).__name__}: {e}"})


# Register all tools
for _tool in TOOLS:
    _register_tool(_tool)


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------

async def health(request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok", "server": "gtm-engine"})


# ---------------------------------------------------------------------------
# Build the Starlette app
# ---------------------------------------------------------------------------

def create_app() -> Starlette:
    """Create the ASGI app with auth middleware and MCP endpoint."""
    # FastMCP.streamable_http_app() returns a Starlette app with a /mcp route.
    # Mount it at the root so /mcp is served correctly.
    mcp_http = mcp.streamable_http_app()

    app = Starlette(
        routes=[
            Route("/health", health, methods=["GET"]),
            Mount("/", app=mcp_http),
        ],
        middleware=[
            Middleware(BearerTokenMiddleware),
        ],
    )
    return app


app = create_app()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

def main() -> None:
    import uvicorn

    host = os.environ.get("MCP_HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", os.environ.get("MCP_PORT", "8080")))

    logger.info("Starting GTM Engine MCP remote server on %s:%d", host, port)
    uvicorn.run(
        "gtm_agent.mcp_remote:app",
        host=host,
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()

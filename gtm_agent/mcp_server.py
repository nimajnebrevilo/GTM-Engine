"""
MCP Server for GTM Engine — exposes pipeline stages as tools for Claude Code.

This lets you use GTM Engine tools directly in Claude Code conversations:
  "Build TAM for client X", "Detect signals for stripe.com", etc.

Setup:
  Add to .claude/settings.json or claude_desktop_config.json:
  {
    "mcpServers": {
      "gtm-engine": {
        "command": "python3",
        "args": ["-m", "gtm_agent.mcp_server"],
        "cwd": "/path/to/GTM-Engine"
      }
    }
  }
"""

import json
import os
import sys
from typing import Any

from pathlib import Path

from dotenv import load_dotenv

# Always load .env from the project root, regardless of cwd
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

# In Claude Code web containers, an egress proxy with an allowlist blocks
# external API hosts (supabase, apollo, exa, etc.).  Bypass it by adding
# every host we talk to to NO_PROXY so httpx / requests go direct.
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

from gtm_agent import engine
from gtm_agent.tools import TOOLS


def _convert_tool_to_mcp(tool: dict) -> dict:
    """Convert our tool format to MCP tool format."""
    return {
        "name": f"gtm_{tool['name']}",
        "description": f"[GTM Engine] {tool['description']}",
        "inputSchema": tool["input_schema"],
    }


def execute_tool(name: str, args: dict[str, Any]) -> str:
    """Execute a tool and return JSON result."""
    # Strip gtm_ prefix if present
    clean_name = name.removeprefix("gtm_")

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
    }

    fn = dispatch.get(clean_name)
    if not fn:
        return json.dumps({"error": f"Unknown tool: {name}"})

    try:
        result = fn()
        return json.dumps(result, default=str)
    except engine.EngineError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        return json.dumps({"error": f"{type(e).__name__}: {e}"})


def handle_jsonrpc(request: dict) -> dict:
    """Handle a JSON-RPC request."""
    method = request.get("method", "")
    req_id = request.get("id")
    params = request.get("params", {})

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "gtm-engine", "version": "0.1.0"},
            },
        }

    elif method == "notifications/initialized":
        # No response needed for notifications
        return None  # type: ignore

    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": [_convert_tool_to_mcp(t) for t in TOOLS],
            },
        }

    elif method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments", {})
        result_text = execute_tool(tool_name, tool_args)

        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "content": [{"type": "text", "text": result_text}],
            },
        }

    else:
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"},
        }


def main():
    """Run MCP server over stdio."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        response = handle_jsonrpc(request)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()

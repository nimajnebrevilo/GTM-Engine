"""
Bridge to the TypeScript GTM Engine via subprocess.

Every function calls `npx tsx src/cli.ts <command> --json-args '{...}'`
and returns parsed JSON. This keeps the TS engine as the single source of truth.
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any


ENGINE_ROOT = Path(__file__).resolve().parent.parent
CLI_PATH = ENGINE_ROOT / "src" / "cli.ts"


class EngineError(Exception):
    """Raised when a CLI command fails."""

    def __init__(self, message: str, stderr: str = ""):
        super().__init__(message)
        self.stderr = stderr


def _run(command: str, args: dict[str, Any] | None = None, timeout: int = 120) -> Any:
    """Execute a CLI command and return parsed JSON output."""
    cmd = ["npx", "tsx", str(CLI_PATH), command]
    if args:
        cmd += ["--json-args", json.dumps(args)]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        cwd=str(ENGINE_ROOT),
        timeout=timeout,
        env={**os.environ},
    )

    if result.returncode != 0:
        # Try to parse structured error
        try:
            err = json.loads(result.stderr or result.stdout)
            raise EngineError(err.get("error", "Unknown error"), result.stderr)
        except (json.JSONDecodeError, TypeError):
            raise EngineError(
                result.stderr.strip() or result.stdout.strip() or f"Command failed with code {result.returncode}",
                result.stderr,
            )

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        # Some commands (like CSV export) return raw text
        return result.stdout


# ── Clients ────────────────────────────────────────────────────────────────


def create_client(name: str, website: str | None = None, industry: str | None = None, notes: str | None = None) -> dict:
    args: dict[str, Any] = {"name": name}
    if website:
        args["website"] = website
    if industry:
        args["industry"] = industry
    if notes:
        args["notes"] = notes
    return _run("client:create", args)


def list_clients() -> list[dict]:
    return _run("client:list")


def get_client(client_id: str) -> dict:
    return _run("client:get", {"id": client_id})


# ── Campaigns ──────────────────────────────────────────────────────────────


def create_campaign(
    client_id: str,
    name: str,
    brief: str | None = None,
    target_geographies: list[str] | None = None,
    target_industries: list[str] | None = None,
    target_company_sizes: list[str] | None = None,
    target_keywords: list[str] | None = None,
    exclusion_keywords: list[str] | None = None,
) -> dict:
    args: dict[str, Any] = {"clientId": client_id, "name": name}
    if brief:
        args["brief"] = brief
    if target_geographies:
        args["targetGeographies"] = target_geographies
    if target_industries:
        args["targetIndustries"] = target_industries
    if target_company_sizes:
        args["targetCompanySizes"] = target_company_sizes
    if target_keywords:
        args["targetKeywords"] = target_keywords
    if exclusion_keywords:
        args["exclusionKeywords"] = exclusion_keywords
    return _run("campaign:create", args)


def list_campaigns(client_id: str | None = None) -> list[dict]:
    return _run("campaign:list", {"clientId": client_id} if client_id else None)


def get_campaign(campaign_id: str) -> dict:
    return _run("campaign:get", {"id": campaign_id})


def update_campaign_status(campaign_id: str, status: str) -> dict:
    return _run("campaign:status", {"id": campaign_id, "status": status})


# ── ICP Definitions ────────────────────────────────────────────────────────


def create_icp(
    client_id: str,
    name: str,
    *,
    geographies: list[str] | None = None,
    industries: list[str] | None = None,
    keywords: list[str] | None = None,
    exclusion_keywords: list[str] | None = None,
    company_size_min: int | None = None,
    company_size_max: int | None = None,
    target_titles: list[str] | None = None,
    target_seniorities: list[str] | None = None,
    target_departments: list[str] | None = None,
    **extra: Any,
) -> dict:
    args: dict[str, Any] = {"clientId": client_id, "name": name}
    if geographies:
        args["geographies"] = geographies
    if industries:
        args["industries"] = industries
    if keywords:
        args["keywords"] = keywords
    if exclusion_keywords:
        args["exclusionKeywords"] = exclusion_keywords
    if company_size_min is not None:
        args["companySizeMin"] = company_size_min
    if company_size_max is not None:
        args["companySizeMax"] = company_size_max
    if target_titles:
        args["targetTitles"] = target_titles
    if target_seniorities:
        args["targetSeniorities"] = target_seniorities
    if target_departments:
        args["targetDepartments"] = target_departments
    args.update(extra)
    return _run("icp:create", args)


def get_active_icp(client_id: str) -> dict | None:
    result = _run("icp:get-active", {"clientId": client_id})
    if isinstance(result, dict) and result.get("found") is False:
        return None
    return result


def list_icps(client_id: str) -> list[dict]:
    return _run("icp:list", {"clientId": client_id})


def activate_icp(icp_id: str) -> dict:
    return _run("icp:activate", {"id": icp_id})


def refine_icp(parent_id: str, **overrides: Any) -> dict:
    return _run("icp:refine", {"parentId": parent_id, **overrides})


def update_icp(icp_id: str, **updates: Any) -> dict:
    return _run("icp:update", {"id": icp_id, **updates})


def challenge_icp(
    icp_id: str,
    website_url: str,
    *,
    skip_client_base: bool = False,
    homepage_only: bool = False,
) -> dict:
    args: dict[str, Any] = {
        "icpId": icp_id,
        "websiteUrl": website_url,
    }
    if skip_client_base:
        args["skipClientBase"] = True
    if homepage_only:
        args["homepageOnly"] = True
    return _run("icp:challenge", args, timeout=180)


# ── Search (Company Discovery) ────────────────────────────────────────────


def search_companies(
    query: str,
    *,
    apollo_filters: dict | None = None,
    similar_to: str | None = None,
    max_results: int | None = None,
) -> dict:
    args: dict[str, Any] = {"query": query}
    if apollo_filters:
        args["apolloFilters"] = apollo_filters
    if similar_to:
        args["similarTo"] = similar_to
    if max_results:
        args["maxResults"] = max_results
    return _run("search", args, timeout=180)


# ── Signals (Trigger Detection) ───────────────────────────────────────────


def detect_signals(
    domain: str,
    *,
    trigger_types: list[str] | None = None,
    num_results: int = 5,
    lookback_days: int | None = None,
) -> list[dict]:
    args: dict[str, Any] = {"domain": domain, "numResults": num_results}
    if trigger_types:
        args["triggerTypes"] = trigger_types
    if lookback_days:
        args["lookbackDays"] = lookback_days
    return _run("signals", args, timeout=180)


# ── TAM Build ─────────────────────────────────────────────────────────────


def build_tam(icp: dict) -> dict:
    return _run("tam:build", icp, timeout=300)


# ── People Search ─────────────────────────────────────────────────────────


def search_people(
    *,
    company_domain: str | None = None,
    organization_id: str | None = None,
    titles: list[str] | None = None,
    seniorities: list[str] | None = None,
    departments: list[str] | None = None,
    per_page: int = 25,
) -> dict:
    args: dict[str, Any] = {
        "roles": {
            "titles": titles or [],
            "seniorities": seniorities,
            "departments": departments,
        },
        "perPage": per_page,
    }
    if company_domain:
        args["companyDomain"] = company_domain
    if organization_id:
        args["organizationId"] = organization_id
    return _run("people:search", args, timeout=120)


# ── Enrichment ─────────────────────────────────────────────────────────────


def enrich_contact(
    contact_id: str,
    first_name: str,
    last_name: str,
    *,
    email: str | None = None,
    phone: str | None = None,
    company_domain: str | None = None,
    linkedin_url: str | None = None,
) -> dict:
    args: dict[str, Any] = {
        "contactId": contact_id,
        "firstName": first_name,
        "lastName": last_name,
    }
    if email:
        args["email"] = email
    if phone:
        args["phone"] = phone
    if company_domain:
        args["companyDomain"] = company_domain
    if linkedin_url:
        args["linkedinUrl"] = linkedin_url
    return _run("enrich", args, timeout=120)


def bulk_verify_emails(emails: list[str]) -> list[dict]:
    return _run("enrich:bulk-verify", {"emails": emails}, timeout=300)


# ── Export ─────────────────────────────────────────────────────────────────


def export_campaign(campaign_id: str, fmt: str = "json") -> Any:
    return _run("export", {"campaignId": campaign_id, "format": fmt}, timeout=120)


# ── Status / Cost ─────────────────────────────────────────────────────────


def get_cost_summary() -> dict:
    return _run("cost:summary")


def get_engine_status() -> dict:
    return _run("status")

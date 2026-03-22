"""
Degraded mode — pipeline operations when external APIs are unreachable.

When the egress proxy blocks Supabase and provider APIs, this module
provides fallback implementations that:
  - Use local JSON file storage instead of Supabase
  - Return structured "needs_websearch" instructions so the agent
    knows to use WebSearch for discovery/signals instead of API calls

The agent is responsible for running WebSearch and feeding results back
through the save_* functions.
"""

from typing import Any
from gtm_agent import local_store


# ── Mode Detection ────────────────────────────────────────────────────────


_degraded = False


def is_degraded() -> bool:
    return _degraded


def set_degraded(value: bool):
    global _degraded
    _degraded = value


# ── Clients (local store passthrough) ─────────────────────────────────────


def create_client(name: str, **kwargs: Any) -> dict:
    return local_store.create_client(name, **kwargs)


def list_clients() -> list[dict]:
    return local_store.list_clients()


def get_client(client_id: str) -> dict:
    result = local_store.get_client(client_id)
    if not result:
        raise ValueError(f"Client {client_id} not found in local store")
    return result


# ── ICPs (local store passthrough) ────────────────────────────────────────


def create_icp(client_id: str, name: str, **fields: Any) -> dict:
    return local_store.create_icp(client_id, name, **fields)


def get_active_icp(client_id: str) -> dict | None:
    return local_store.get_active_icp(client_id)


def activate_icp(icp_id: str) -> dict:
    return local_store.activate_icp(icp_id)


def refine_icp(parent_id: str, **overrides: Any) -> dict:
    return local_store.refine_icp(parent_id, **overrides)


def update_icp(icp_id: str, **updates: Any) -> dict:
    return local_store.update_icp(icp_id, **updates)


def challenge_icp(icp_id: str, website_url: str, **kwargs: Any) -> dict:
    """
    In degraded mode, we can't deep-scrape via the engine.
    Return instructions for the agent to use WebFetch on the website
    and do the analysis itself.
    """
    return {
        "mode": "degraded",
        "action_required": "manual_website_analysis",
        "instructions": (
            f"The ICP challenge engine is unavailable (API blocked). "
            f"You must analyse the website yourself:\n"
            f"1. Use WebFetch on {website_url} (homepage)\n"
            f"2. Use WebFetch on {website_url}/about\n"
            f"3. Use WebFetch on {website_url}/pricing\n"
            f"4. Use WebFetch on {website_url}/customers or /case-studies\n"
            f"5. Extract: value proposition, target personas, pricing signals, customer logos, tech stack\n"
            f"6. Compare these against the ICP definition and identify contradictions/gaps\n"
            f"7. Present your findings at Gate 2 as normal"
        ),
        "icp_id": icp_id,
        "website_url": website_url,
    }


# ── Campaigns (local store passthrough) ───────────────────────────────────


def create_campaign(client_id: str, name: str, **fields: Any) -> dict:
    return local_store.create_campaign(client_id, name, **fields)


def list_campaigns(client_id: str | None = None) -> list[dict]:
    return local_store.list_campaigns(client_id)


# ── Company Discovery (WebSearch-driven) ──────────────────────────────────


def search_companies(query: str, **kwargs: Any) -> dict:
    """
    In degraded mode, we can't call Exa/Apollo.
    Return instructions for the agent to use WebSearch and feed results back.
    """
    return {
        "mode": "degraded",
        "action_required": "websearch_company_discovery",
        "instructions": (
            "External search APIs are unavailable (proxy blocked). Use WebSearch to find companies:\n"
            f"1. Run WebSearch with query: \"{query}\"\n"
            "2. Run 2-3 additional WebSearch queries with variations (different keywords, more specific geo/industry terms)\n"
            "3. For each company found, extract: name, domain, description, industry, employee count (if visible), country\n"
            "4. Call gtm_save_companies with the structured results to persist them locally\n"
            "5. Present the results to the user before proceeding"
        ),
        "suggested_queries": [
            query,
            f"{query} site:linkedin.com/company",
            f"{query} company list directory",
        ],
        "query": query,
    }


def save_companies(companies: list[dict]) -> dict:
    """Save WebSearch-discovered companies to local store."""
    saved = []
    for c in companies:
        result = local_store.upsert_company(c)
        saved.append(result)
    return {
        "saved": len(saved),
        "companies": saved,
    }


# ── Signal Detection (WebSearch-driven) ───────────────────────────────────


def detect_signals(domain: str, **kwargs: Any) -> dict:
    """
    In degraded mode, return instructions for WebSearch-based signal detection.
    """
    trigger_types = kwargs.get("trigger_types") or [
        "funding", "hiring", "leadership", "expansion", "product launch", "acquisition"
    ]
    return {
        "mode": "degraded",
        "action_required": "websearch_signal_detection",
        "instructions": (
            f"Signal detection APIs are unavailable. Use WebSearch to find signals for {domain}:\n"
            + "\n".join(
                f"  - Search: \"{domain} {t} 2026\" or \"{domain} {t} announcement\""
                for t in trigger_types
            )
            + f"\n\nFor each signal found, extract: type, headline, source URL, date.\n"
            f"Call gtm_save_signals with domain='{domain}' and the structured results."
        ),
        "domain": domain,
    }


def save_signals(domain: str, signals: list[dict]) -> dict:
    """Save WebSearch-discovered signals to local store."""
    local_store.save_signals(domain, signals)
    return {"saved": len(signals), "domain": domain}


# ── TAM Build (local scoring) ────────────────────────────────────────────


def build_tam(icp: dict) -> dict:
    """
    Score locally stored companies against ICP criteria.
    Simplified version of the TS TAM builder.
    """
    companies = local_store.list_companies()
    if not companies:
        return {
            "mode": "degraded",
            "total_companies": 0,
            "message": "No companies in local store. Run company discovery first.",
        }

    icp_geos = [g.lower() for g in (icp.get("geographies") or [])]
    icp_industries = [i.lower() for i in (icp.get("industries") or [])]
    icp_keywords = [k.lower() for k in (icp.get("keywords") or [])]
    icp_exclusions = [e.lower() for e in (icp.get("exclusion_keywords") or icp.get("exclusionKeywords") or [])]
    size_min = icp.get("company_size_min") or icp.get("companySizeMin") or 0
    size_max = icp.get("company_size_max") or icp.get("companySizeMax") or 999999

    tiers = {"tier_1": [], "tier_2": [], "tier_3": []}

    for company in companies:
        score = 0.0
        max_score = 0.0

        # Geography match (weight 3)
        max_score += 3
        country = (company.get("country") or "").lower()
        if country and any(g in country for g in icp_geos):
            score += 3

        # Industry match (weight 3)
        max_score += 3
        industry = (company.get("industry") or "").lower()
        if industry and any(i in industry for i in icp_industries):
            score += 3

        # Size match (weight 2)
        max_score += 2
        emp = company.get("employee_count") or company.get("employeeCount") or 0
        if isinstance(emp, (int, float)) and size_min <= emp <= size_max:
            score += 2

        # Keyword match (weight 2)
        max_score += 2
        desc = (company.get("description") or "").lower()
        name = (company.get("name") or "").lower()
        text = f"{desc} {name} {industry}"
        if any(k in text for k in icp_keywords):
            score += 2

        # Exclusion penalty
        if any(e in text for e in icp_exclusions):
            score = max(0, score - 2)

        normalized = score / max_score if max_score > 0 else 0
        company["_icp_score"] = round(normalized, 2)

        if normalized >= 0.8:
            tiers["tier_1"].append(company)
        elif normalized >= 0.5:
            tiers["tier_2"].append(company)
        else:
            tiers["tier_3"].append(company)

    return {
        "mode": "degraded",
        "total_companies": len(companies),
        "tier_1": {"count": len(tiers["tier_1"]), "companies": tiers["tier_1"]},
        "tier_2": {"count": len(tiers["tier_2"]), "companies": tiers["tier_2"]},
        "tier_3": {"count": len(tiers["tier_3"]), "companies": tiers["tier_3"]},
    }


# ── People Search (WebSearch-driven) ─────────────────────────────────────


def search_people(company_domain: str | None = None, titles: list[str] | None = None, **kwargs: Any) -> dict:
    """Return instructions for WebSearch-based people discovery."""
    title_str = ", ".join(titles or ["decision maker"])
    return {
        "mode": "degraded",
        "action_required": "websearch_people_discovery",
        "instructions": (
            f"People search APIs are unavailable. Use WebSearch to find contacts:\n"
            f"1. Search: \"{company_domain} {title_str} site:linkedin.com\"\n"
            f"2. Search: \"{company_domain} {title_str} team leadership\"\n"
            f"3. For each person found, extract: first name, last name, title, LinkedIn URL\n"
            f"4. Call gtm_save_contacts with the structured results"
        ),
        "company_domain": company_domain,
        "titles": titles,
    }


def save_contacts(contacts: list[dict]) -> dict:
    """Save WebSearch-discovered contacts to local store."""
    saved = []
    for c in contacts:
        result = local_store.upsert_contact(c)
        saved.append(result)
    return {"saved": len(saved), "contacts": saved}


# ── Enrichment (not available in degraded mode) ──────────────────────────


def enrich_contact(**kwargs: Any) -> dict:
    return {
        "mode": "degraded",
        "action_required": "none",
        "message": (
            "Contact enrichment (email/phone waterfall) is NOT available in degraded mode. "
            "Email finding requires Apollo/Prospeo APIs which are blocked by the proxy. "
            "The contacts have been saved with whatever data WebSearch provided. "
            "To enrich contacts, re-run this campaign when API access is available."
        ),
    }


def bulk_verify_emails(emails: list[str]) -> dict:
    return {
        "mode": "degraded",
        "action_required": "none",
        "message": "Email verification unavailable in degraded mode (Million Verifier API blocked).",
    }


# ── Export (from local store) ─────────────────────────────────────────────


def export_campaign(campaign_id: str | None = None, **kwargs: Any) -> dict:
    return local_store.export_all()


# ── Status ────────────────────────────────────────────────────────────────


def get_cost_summary() -> dict:
    return {
        "mode": "degraded",
        "message": "Running in degraded mode — no API credits consumed. Using WebSearch + local storage.",
        "credits_used": 0,
    }


def get_engine_status() -> dict:
    return {
        "mode": "degraded",
        "database": "local_json_store",
        "providers": {
            "exa": False,
            "apollo": False,
            "prospeo": False,
            "million_verifier": False,
            "freckle": False,
            "websearch": True,
        },
        "message": "External APIs blocked by egress proxy. Using WebSearch for discovery and local JSON for storage.",
    }

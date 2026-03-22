"""
Local JSON file store — fallback when Supabase is unreachable.

Stores clients, ICPs, campaigns, companies, and contacts as JSON files
in a local directory. Provides the same CRUD interface the engine expects
so the pipeline can run in degraded mode without a database.

Data lives in: <project_root>/data/local_store/
"""

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


_PROJECT_ROOT = Path(__file__).resolve().parent.parent
STORE_DIR = _PROJECT_ROOT / "data" / "local_store"


def _ensure_dir():
    STORE_DIR.mkdir(parents=True, exist_ok=True)


def _collection_path(collection: str) -> Path:
    _ensure_dir()
    return STORE_DIR / f"{collection}.json"


def _load(collection: str) -> list[dict]:
    path = _collection_path(collection)
    if not path.exists():
        return []
    with open(path) as f:
        return json.load(f)


def _save(collection: str, records: list[dict]):
    path = _collection_path(collection)
    with open(path, "w") as f:
        json.dump(records, f, indent=2, default=str)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Clients ──────────────────────────────────────────────────────────────


def create_client(name: str, website: str | None = None, industry: str | None = None, notes: str | None = None) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "name": name,
        "website": website,
        "industry": industry,
        "notes": notes,
        "created_at": _now(),
    }
    records = _load("clients")
    records.append(record)
    _save("clients", records)
    return record


def list_clients() -> list[dict]:
    return _load("clients")


def get_client(client_id: str) -> dict | None:
    for r in _load("clients"):
        if r["id"] == client_id:
            return r
    return None


# ── ICPs ─────────────────────────────────────────────────────────────────


def create_icp(client_id: str, name: str, **fields: Any) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "name": name,
        "status": "draft",
        "created_at": _now(),
        **fields,
    }
    records = _load("icps")
    records.append(record)
    _save("icps", records)
    return record


def get_active_icp(client_id: str) -> dict | None:
    for r in _load("icps"):
        if r.get("client_id") == client_id and r.get("status") == "active":
            return r
    return None


def activate_icp(icp_id: str) -> dict:
    records = _load("icps")
    target = None
    for r in records:
        # Archive any currently active ICP for the same client
        if r["id"] == icp_id:
            target = r
    if not target:
        raise ValueError(f"ICP {icp_id} not found")

    for r in records:
        if r.get("client_id") == target["client_id"] and r.get("status") == "active":
            r["status"] = "archived"
    target["status"] = "active"
    _save("icps", records)
    return target


def refine_icp(parent_id: str, **overrides: Any) -> dict:
    records = _load("icps")
    parent = next((r for r in records if r["id"] == parent_id), None)
    if not parent:
        raise ValueError(f"ICP {parent_id} not found")

    refined = {**parent, **overrides}
    refined["id"] = str(uuid.uuid4())
    refined["parent_id"] = parent_id
    refined["status"] = "draft"
    refined["created_at"] = _now()
    records.append(refined)
    _save("icps", records)
    return refined


def update_icp(icp_id: str, **updates: Any) -> dict:
    records = _load("icps")
    for r in records:
        if r["id"] == icp_id:
            r.update(updates)
            _save("icps", records)
            return r
    raise ValueError(f"ICP {icp_id} not found")


# ── Campaigns ────────────────────────────────────────────────────────────


def create_campaign(client_id: str, name: str, **fields: Any) -> dict:
    record = {
        "id": str(uuid.uuid4()),
        "client_id": client_id,
        "name": name,
        "status": "draft",
        "created_at": _now(),
        **fields,
    }
    records = _load("campaigns")
    records.append(record)
    _save("campaigns", records)
    return record


def list_campaigns(client_id: str | None = None) -> list[dict]:
    records = _load("campaigns")
    if client_id:
        return [r for r in records if r.get("client_id") == client_id]
    return records


# ── Companies ────────────────────────────────────────────────────────────


def upsert_company(company: dict) -> dict:
    """Upsert a company by domain (dedup key)."""
    records = _load("companies")
    domain = company.get("domain")

    if domain:
        for i, r in enumerate(records):
            if r.get("domain") == domain:
                records[i] = {**r, **company, "updated_at": _now()}
                _save("companies", records)
                return records[i]

    if "id" not in company:
        company["id"] = str(uuid.uuid4())
    company["created_at"] = _now()
    records.append(company)
    _save("companies", records)
    return company


def list_companies() -> list[dict]:
    return _load("companies")


# ── Contacts ─────────────────────────────────────────────────────────────


def upsert_contact(contact: dict) -> dict:
    records = _load("contacts")
    linkedin = contact.get("linkedin_url")

    if linkedin:
        for i, r in enumerate(records):
            if r.get("linkedin_url") == linkedin:
                records[i] = {**r, **contact, "updated_at": _now()}
                _save("contacts", records)
                return records[i]

    if "id" not in contact:
        contact["id"] = str(uuid.uuid4())
    contact["created_at"] = _now()
    records.append(contact)
    _save("contacts", records)
    return contact


def list_contacts(company_domain: str | None = None) -> list[dict]:
    records = _load("contacts")
    if company_domain:
        return [r for r in records if r.get("company_domain") == company_domain]
    return records


# ── Signals ──────────────────────────────────────────────────────────────


def save_signals(domain: str, signals: list[dict]):
    records = _load("signals")
    # Remove old signals for this domain
    records = [r for r in records if r.get("domain") != domain]
    for s in signals:
        s["domain"] = domain
        s["saved_at"] = _now()
    records.extend(signals)
    _save("signals", records)


def get_signals(domain: str) -> list[dict]:
    return [r for r in _load("signals") if r.get("domain") == domain]


# ── Export ───────────────────────────────────────────────────────────────


def export_all() -> dict:
    """Export the full local store as a single dict."""
    return {
        "clients": _load("clients"),
        "icps": _load("icps"),
        "campaigns": _load("campaigns"),
        "companies": _load("companies"),
        "contacts": _load("contacts"),
        "signals": _load("signals"),
        "exported_at": _now(),
    }

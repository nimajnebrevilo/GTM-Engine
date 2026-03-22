"""
Claude tool definitions for the GTM Engine pipeline.

Each tool maps to an engine.py function. Claude uses these to autonomously
drive the 6-stage pipeline: TAM Build -> Signals -> ICP Score -> People Search -> Enrich -> Export
"""

TOOLS = [
    # ── Client Management ──────────────────────────────────────────────────
    {
        "name": "create_client",
        "description": "Create a new agency client account. This is the first step for any new engagement.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Client company name"},
                "website": {"type": "string", "description": "Client website URL"},
                "industry": {"type": "string", "description": "Client's industry"},
                "notes": {"type": "string", "description": "Any notes about the client"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "list_clients",
        "description": "List all agency clients. Use this to find existing client IDs or check if a client already exists.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_client",
        "description": "Get full details for a specific client by ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Client UUID"},
            },
            "required": ["client_id"],
        },
    },
    # ── Campaign Management ────────────────────────────────────────────────
    {
        "name": "create_campaign",
        "description": "Create a new prospecting campaign for a client. Campaigns group targeting criteria and track delivery.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Client UUID"},
                "name": {"type": "string", "description": "Campaign name (e.g. 'Q1 2026 UK SaaS')"},
                "brief": {"type": "string", "description": "Campaign brief describing objectives and targets"},
                "target_geographies": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Target countries/regions",
                },
                "target_industries": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Target industries",
                },
                "target_company_sizes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Company size bands (e.g. '51-250', '251-1000')",
                },
                "target_keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Keywords relevant to the ICP",
                },
                "exclusion_keywords": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Keywords to exclude",
                },
            },
            "required": ["client_id", "name"],
        },
    },
    {
        "name": "list_campaigns",
        "description": "List campaigns, optionally filtered by client. Shows campaign status and delivery dates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string", "description": "Optional client UUID to filter by"},
            },
        },
    },
    # ── ICP Definition ─────────────────────────────────────────────────────
    {
        "name": "create_icp",
        "description": "Create an Ideal Customer Profile (ICP) definition for a client. This defines WHO we're looking for — industries, geographies, company sizes, keywords, and target roles. For NEW campaigns, analyse the client's website and brief first, then challenge the assumptions before finalising.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string"},
                "name": {"type": "string", "description": "ICP name (e.g. 'UK Mid-Market SaaS v1')"},
                "geographies": {"type": "array", "items": {"type": "string"}},
                "industries": {"type": "array", "items": {"type": "string"}},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "exclusion_keywords": {"type": "array", "items": {"type": "string"}},
                "company_size_min": {"type": "integer"},
                "company_size_max": {"type": "integer"},
                "target_titles": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Job titles to target (e.g. 'VP Sales', 'CRO', 'Head of Growth')",
                },
                "target_seniorities": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Seniority levels (e.g. 'vp', 'director', 'c_suite')",
                },
                "target_departments": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Departments (e.g. 'sales', 'marketing', 'engineering')",
                },
            },
            "required": ["client_id", "name"],
        },
    },
    {
        "name": "get_active_icp",
        "description": "Get the currently active ICP for a client. Returns null if none is active — you'll need to create one.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_id": {"type": "string"},
            },
            "required": ["client_id"],
        },
    },
    {
        "name": "activate_icp",
        "description": "Activate an ICP definition (and archive any previously active one for this client). Do this after the human has approved the ICP.",
        "input_schema": {
            "type": "object",
            "properties": {
                "icp_id": {"type": "string"},
            },
            "required": ["icp_id"],
        },
    },
    {
        "name": "refine_icp",
        "description": "Create a new version of an ICP with overrides. Use this during the ICP challenge process to iterate on definitions. Creates a new draft version linked to the parent.",
        "input_schema": {
            "type": "object",
            "properties": {
                "parent_id": {"type": "string", "description": "ID of the ICP to refine"},
                "geographies": {"type": "array", "items": {"type": "string"}},
                "industries": {"type": "array", "items": {"type": "string"}},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "exclusion_keywords": {"type": "array", "items": {"type": "string"}},
                "company_size_min": {"type": "integer"},
                "company_size_max": {"type": "integer"},
                "target_titles": {"type": "array", "items": {"type": "string"}},
                "target_seniorities": {"type": "array", "items": {"type": "string"}},
                "target_departments": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["parent_id"],
        },
    },
    {
        "name": "update_icp",
        "description": "Update fields on an existing ICP definition. Use to store website analysis, challenge summary, and refinement metadata.",
        "input_schema": {
            "type": "object",
            "properties": {
                "icp_id": {"type": "string"},
                "website_analysis": {"type": "object", "description": "Structured website analysis results"},
                "challenge_summary": {"type": "string", "description": "Summary of the ICP challenge process"},
                "refinements": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "List of refinement observations",
                },
            },
            "required": ["icp_id"],
        },
    },
    {
        "name": "challenge_icp",
        "description": "Challenge an ICP definition against the client's website and existing client base. Deep-scrapes the website (homepage, pricing, about, customers pages) to extract value proposition, target personas, pricing signals, customer logos, case studies, and tech stack. Compares these signals against the stated ICP and generates refinements with confidence scores. Use this BEFORE activating an ICP to validate assumptions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "icp_id": {"type": "string", "description": "ID of the draft ICP to challenge"},
                "website_url": {"type": "string", "description": "Client website URL to analyse (e.g. 'https://acme.com')"},
                "skip_client_base": {
                    "type": "boolean",
                    "description": "Skip client-base analysis (faster, website-only challenge). Default false.",
                },
                "homepage_only": {
                    "type": "boolean",
                    "description": "Only analyse homepage (faster but less thorough). Default false.",
                },
            },
            "required": ["icp_id", "website_url"],
        },
    },
    # ── Company Discovery (Stage 1: TAM Build) ────────────────────────────
    {
        "name": "search_companies",
        "description": "Discover companies matching the ICP using Exa (semantic search) and Apollo (structured search) in parallel. Companies are automatically deduplicated and upserted to the database. Use natural language for the query — describe the ideal company.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural language ICP description for semantic search (e.g. 'B2B SaaS companies in UK with 50-500 employees selling to enterprise')",
                },
                "apollo_filters": {
                    "type": "object",
                    "properties": {
                        "industries": {"type": "array", "items": {"type": "string"}},
                        "employee_ranges": {"type": "array", "items": {"type": "string"}},
                        "locations": {"type": "array", "items": {"type": "string"}},
                    },
                    "description": "Structured filters for Apollo search",
                },
                "similar_to": {
                    "type": "string",
                    "description": "URL of a known-good company to find similar ones via Exa",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Max results per provider (default 25)",
                },
            },
            "required": ["query"],
        },
    },
    # ── Signal Detection (Stage 2) ────────────────────────────────────────
    {
        "name": "detect_signals",
        "description": "Scan a company for buying intent signals: funding rounds, new hires, leadership changes, expansions, product launches, acquisitions, news mentions. Uses Exa neural search.",
        "input_schema": {
            "type": "object",
            "properties": {
                "domain": {"type": "string", "description": "Company domain to scan (e.g. 'acme.com')"},
                "trigger_types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["funding_round", "new_hire", "leadership_change", "expansion", "product_launch", "acquisition", "news_mention"],
                    },
                    "description": "Which signal types to check (default: all)",
                },
                "num_results": {"type": "integer", "description": "Results per signal type (default 5)"},
                "lookback_days": {"type": "integer", "description": "Only find signals from last N days"},
            },
            "required": ["domain"],
        },
    },
    # ── TAM Build (Stage 3: ICP Scoring) ──────────────────────────────────
    {
        "name": "build_tam",
        "description": "Score all companies in the database against an ICP and generate a TAM summary. Returns tier distribution, geography breakdown, industry breakdown, and size distribution. Use the ICP definition fields directly.",
        "input_schema": {
            "type": "object",
            "properties": {
                "geographies": {"type": "array", "items": {"type": "string"}},
                "industries": {"type": "array", "items": {"type": "string"}},
                "keywords": {"type": "array", "items": {"type": "string"}},
                "exclusion_keywords": {"type": "array", "items": {"type": "string"}},
                "company_size_min": {"type": "integer", "description": "Minimum employee count"},
                "company_size_max": {"type": "integer", "description": "Maximum employee count"},
            },
            "required": ["geographies", "industries", "keywords"],
        },
    },
    # ── People Search (Stage 4) ───────────────────────────────────────────
    {
        "name": "search_people",
        "description": "Find contacts at a specific company matching role criteria. Uses Apollo people search. Run this after discovering companies to find decision-makers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "company_domain": {"type": "string", "description": "Company domain to search within"},
                "titles": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Job titles to search for (e.g. ['VP Sales', 'Head of Revenue'])",
                },
                "seniorities": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Seniority levels (e.g. ['vp', 'director', 'c_suite'])",
                },
                "departments": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Departments (e.g. ['sales', 'marketing'])",
                },
                "per_page": {"type": "integer", "description": "Results per page (default 25)"},
            },
            "required": ["company_domain", "titles"],
        },
    },
    # ── Enrichment (Stage 5) ──────────────────────────────────────────────
    {
        "name": "enrich_contact",
        "description": "Enrich a contact with email and phone via the waterfall: Cache -> Apollo -> Prospeo -> Freckle, with Million Verifier inline validation. Returns verified email + phone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "contact_id": {"type": "string"},
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string", "description": "Known email (if any)"},
                "phone": {"type": "string", "description": "Known phone (if any)"},
                "company_domain": {"type": "string"},
                "linkedin_url": {"type": "string"},
            },
            "required": ["contact_id", "first_name", "last_name"],
        },
    },
    {
        "name": "bulk_verify_emails",
        "description": "Bulk verify a list of emails via Million Verifier. Run this as the final sweep before export to catch any invalid emails.",
        "input_schema": {
            "type": "object",
            "properties": {
                "emails": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Email addresses to verify",
                },
            },
            "required": ["emails"],
        },
    },
    # ── Export (Stage 6) ──────────────────────────────────────────────────
    {
        "name": "export_campaign",
        "description": "Export all campaign data (companies + contacts + enrichment) as JSON or CSV. This is the final deliverable.",
        "input_schema": {
            "type": "object",
            "properties": {
                "campaign_id": {"type": "string"},
                "format": {
                    "type": "string",
                    "enum": ["json", "csv"],
                    "description": "Export format (default: json)",
                },
            },
            "required": ["campaign_id"],
        },
    },
    # ── Observability ─────────────────────────────────────────────────────
    {
        "name": "get_cost_summary",
        "description": "Get current credit usage and remaining budget across all providers (Apollo, Prospeo, Freckle). Check this before running expensive operations like enrichment.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_engine_status",
        "description": "Check which providers are configured (have API keys) and engine health. Run this at the start to understand available capabilities.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    # ── Preflight ──────────────────────────────────────────────────────────
    {
        "name": "preflight_check",
        "description": (
            "MANDATORY first step before ANY prospecting work. "
            "Tests database connectivity, provider API keys, and credit budget in one call. "
            "Returns a structured pass/fail report with an overall 'ready' boolean. "
            "If ready=false, STOP and present the blockers to the user — do NOT proceed with the pipeline. "
            "If ready=true, present the preflight summary to the user and wait for confirmation before continuing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
]

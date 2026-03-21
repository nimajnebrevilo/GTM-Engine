# GTM Engine — User Guide

## What This Is

GTM Engine is an agentic B2B prospecting pipeline. You describe who you want to reach — it finds the companies, validates your assumptions, discovers decision-makers, enriches their contact details, and exports delivery-ready lists.

It runs as a set of **MCP tools** inside Claude Code. You talk to Claude in natural language, and it orchestrates a 20-tool pipeline across 5 data providers, a Supabase database holding 4.8M+ companies, and a challenge engine that pressure-tests your targeting before you spend credits.

This is not a dashboard you click through. It is an always-on agent that does the research, flags the risks, and asks you to decide.

---

## How It Fits Into Your Day-to-Day

### The Shift: From Manual Pipeline to Agentic Infrastructure

Today, prospecting looks like this:
1. Client brief lands → you manually define ICP in a spreadsheet
2. Search Apollo/LinkedIn → export CSVs → deduplicate manually
3. Enrich contacts one platform at a time → verify emails separately
4. Build campaign lists → hope the targeting was right

With GTM Engine on an always-on Mac Mini with agentic capabilities, the workflow becomes:

**Morning standup with Claude:**
> "We signed Acme Corp yesterday. SaaS company, sells DevOps tooling, website is acme.com. They want 500 qualified leads in the UK, targeting engineering leadership at mid-market companies."

Claude will:
1. Create the client record
2. Draft an ICP from the brief
3. Deep-scrape acme.com (homepage, pricing, about, customers pages)
4. Challenge the ICP — *"Their pricing page shows enterprise SSO and SOC 2 badges, but you said mid-market. Their customer logos include Datadog and Cloudflare. Should we expand to 500-2000 employees?"*
5. Wait for your approval
6. Run company discovery across Exa + Apollo in parallel
7. Score and tier the results
8. Find decision-makers at Tier 1 companies
9. Enrich contacts through the waterfall (Apollo → Prospeo → Freckle)
10. Verify all emails via Million Verifier
11. Export a delivery-ready CSV

You make three decisions: approve the ICP, confirm enrichment batch size, say "export". The agent handles everything else.

### Always-On Mac Mini: What Changes

When GTM Engine runs on persistent infrastructure:

- **Campaign monitoring** — the agent can check for new signals (funding rounds, leadership changes) on your existing pipeline companies daily
- **Enrichment drip** — instead of burning 500 credits in one go, schedule enrichment in batches across the week
- **Multi-client orchestration** — kick off discovery for Client A, switch to reviewing Client B's exports, come back to A when it's done
- **Skill integration** — the cold email copy grader, domain setup automation, and Prospeo export skills run alongside the pipeline as complementary capabilities

The Mac Mini becomes your agency's back-office analyst that never sleeps.

---

## Architecture at a Glance

```
You (natural language)
  ↓
Claude Code + MCP Tools (20 tools)
  ↓
Python Bridge (gtm_agent/)
  ↓
TypeScript Engine (src/)
  ↓
┌─────────────────────────────────────────────────┐
│  Providers                                       │
│  ├── Exa         — semantic search + signals     │
│  ├── Apollo      — structured search + contacts  │
│  ├── Prospeo     — email finder + verify         │
│  ├── Freckle     — enrichment fallback           │
│  └── Million Verifier — bulk email validation    │
│                                                   │
│  Database                                         │
│  └── Supabase (Postgres) — 4.8M+ companies       │
│      ├── 19 tables                                │
│      ├── ICP definitions (versioned)              │
│      ├── Campaign tracking                        │
│      ├── Enrichment cache + cost tracking         │
│      └── Full-text search indexes                 │
└─────────────────────────────────────────────────┘
```

---

## The Pipeline: Stage by Stage

### Stage 0: Client & Campaign Setup

Every engagement starts with a client record. Campaigns sit under clients and group targeting + delivery.

```
"Create a client called Acme Corp, website acme.com, they're in DevOps tooling"
"Create a campaign called Q2 UK Engineering Leaders for Acme"
```

### Stage 1: ICP Definition & Challenge

This is where GTM Engine earns its keep. Instead of blindly accepting targeting parameters, it challenges them.

**Creating an ICP:**
```
"Create an ICP for Acme targeting UK mid-market SaaS companies,
50-500 employees, keywords: DevOps, CI/CD, infrastructure.
Target VP Engineering, CTO, Head of Platform."
```

**Challenging the ICP:**
```
"Challenge this ICP against acme.com"
```

The challenge engine will:
- Deep-scrape the homepage, /pricing, /about, /customers, /case-studies, /solutions
- Extract value proposition, target personas, pricing signals
- Find customer logos and cross-reference against the stated ICP
- Pull existing client-base patterns from the database
- Generate confidence-scored refinements:
  - **Contradictions** — "Website says enterprise but ICP says mid-market"
  - **Expansions** — "Customer logos include large enterprises, consider raising max size"
  - **Narrowing** — "ICP says global but clients concentrated in UK + US"
  - **Confirmations** — "Found 12 customer logos, validates SaaS vertical"

You review, adjust, and activate the ICP. Only then does discovery begin.

### Stage 2: Company Discovery

Runs Exa (semantic/neural search) and Apollo (structured filters) in parallel. Companies are deduplicated by domain and upserted to Supabase.

```
"Search for B2B SaaS companies in the UK with 50-500 employees
building developer tools or infrastructure software"
```

Returns: company count, sources breakdown, duplicates skipped.

### Stage 3: Signal Detection

Scans discovered companies for buying intent — recent funding, new hires, leadership changes, expansions, product launches, acquisitions.

```
"Check signals for stripe.com — focus on new hires and expansion"
```

Signals are scored by strength and stored with expiry dates.

### Stage 4: TAM Build & Scoring

Scores every discovered company against the active ICP. Produces tier distribution (Tier 1: 80%+ fit, Tier 2: 50-80%, Tier 3: below 50%) with breakdowns by geography, industry, and company size.

```
"Build the TAM for Acme's active ICP"
```

### Stage 5: People Search

Finds decision-makers at target companies using role criteria from the ICP (titles, seniorities, departments).

```
"Find VP Engineering and CTO contacts at the top 20 Tier 1 companies"
```

### Stage 6: Enrichment

Waterfall enrichment for verified contact details:

1. **Cache** — check if we've enriched this person before
2. **Apollo** — primary enrichment
3. **Prospeo** — email finder fallback
4. **Freckle** — last-resort enrichment
5. **Million Verifier** — inline email validation

Cost tracking is built in. The agent will tell you credit usage before and after.

### Stage 7: Export

```
"Export the Acme campaign as CSV"
```

Delivery-ready file with companies, contacts, enrichment data, and ICP fit scores.

---

## The Skills Library

Four specialised Claude Code skills ship alongside the engine:

| Skill | What It Does | API Keys Needed |
|-------|-------------|-----------------|
| **Cold Email Copy Grader** | Scores campaign copy 0-100, catches the AI personalization trap (71% poor rate), rewrites bad sequences | None |
| **Domain Setup (Dynadot + Zapmail)** | Automates domain purchasing, DNS config, inbox creation for cold email infrastructure | Dynadot API, Zapmail API |
| **Google Maps Scraper** | Local business lead discovery from Maps, includes 42K US zip codes | RapidAPI (Maps Data API) |
| **Prospeo Full Export** | Bulk people search export handling 25K+ results via state-by-state splitting | Prospeo API |

These run independently or complement the main pipeline. The copy grader is especially useful — run it on campaign messaging before sending.

---

## Working With the Agent

### Natural Language, Not Commands

You don't need to remember tool names. Just describe what you want:

- *"Who are our clients?"* → `list_clients`
- *"Show me the active ICP for Acme"* → `get_active_icp`
- *"Find me Series A SaaS companies in Germany"* → `search_companies`
- *"How many credits have we used?"* → `get_cost_summary`

### When Claude Will Stop and Ask

The agent runs autonomously for known workflows but will **always pause** for:

1. **New ICP approval** — it will present the ICP with reasoning and concerns
2. **Large enrichment batches** — it will show estimated credit cost first
3. **Contradictions** — if the challenge engine finds misalignment between website and stated ICP
4. **Budget limits** — if an operation would exceed credit caps

### Cost Controls

Monthly credit caps are configured in `.env`:

```
APOLLO_MONTHLY_CREDIT_CAP=10000
PROSPEO_MONTHLY_CREDIT_CAP=5000
FRECKLE_MONTHLY_CREDIT_CAP=3000
```

Check usage anytime: *"What's my credit usage?"*

---

## Setup

### Prerequisites

- Node.js 18+
- Python 3.11+
- Supabase project (with the schema migrations applied)
- Claude Code installed

### Installation

```bash
# Install Node dependencies
npm install

# Install Python dependencies
pip install -e ".[mcp]"

# Copy env template and fill in your keys
cp .env.example .env

# Run database migrations
# (apply supabase/migrations/00001_prospecting_schema.sql
#  then  supabase/migrations/00002_icp_definitions.sql)
```

### Connecting to Claude Code

The `.mcp.json` in the repo root auto-registers the GTM Engine as an MCP server:

```json
{
  "mcpServers": {
    "gtm-engine": {
      "command": "python3",
      "args": ["-m", "gtm_agent.mcp_server"],
      "cwd": "."
    }
  }
}
```

Open Claude Code in the GTM-Engine directory and the 20 tools are available immediately.

### Verify Setup

Start a conversation and say: *"Check engine status"*

You'll see which providers are configured and ready.

---

## Database

### What's Already There

The Supabase instance holds 4.8M+ pre-loaded companies. The schema includes:

- **19 tables** across two migrations
- **Full-text search** on companies and contacts
- **ICP versioning** — every refinement creates a new version linked to its parent
- **Enrichment caching** — provider responses cached with TTL to avoid duplicate credit spend
- **Campaign tracking** — companies scored, contacts tracked through outreach lifecycle

### Key Tables

| Table | Purpose |
|-------|---------|
| `clients` | Agency client accounts |
| `companies` | 4.8M+ shared company pool |
| `contacts` | People linked to companies |
| `campaigns` | Prospecting engagements |
| `icp_definitions` | Versioned ICP with challenge metadata |
| `campaign_companies` | Company-campaign links with ICP fit scores |
| `campaign_contacts` | Outreach tracking (sent, opened, replied) |
| `signals` | Buying intent events |
| `enrichment_cache` | Provider response caching |
| `enrichment_log` | Audit trail for all enrichment |

---

## Roadmap Context: ICP Docs in Supabase

The skill documents (SKILL.md files) and future ICP reference materials will be ingested into Supabase as structured knowledge. This means the challenge engine will be able to reference:

- Proven campaign patterns from 1,000+ real B2B engagements
- Anti-pattern detection (the 71% AI personalization failure rate, bump-only follow-ups)
- Industry-specific ICP benchmarks
- Grading rubrics for campaign quality

This turns the challenge engine from "compare ICP against website" into "compare ICP against website AND everything we know about what actually works."

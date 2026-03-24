# GTM Engine — Claude Code Instructions

## Golden Rule

**Always use the GTM Engine MCP tools (`gtm_*`) for prospecting work. Never bypass them with raw provider APIs.**

The `gtm_*` tools exist because raw API calls skip deduplication, enrichment waterfalls, email verification, cost tracking, signal detection, and database persistence. Every time you reach for a raw Apollo/Prospeo/Exa call directly, you produce smaller lists, riskier data, and zero audit trail.

---

## Confirmation Gates (NEVER skip these)

The pipeline has mandatory checkpoints where you MUST stop and get human approval.

| Gate | When | Your job | What to show the user |
|------|------|----------|----------------------|
| **Preflight** | Before anything | Run `gtm_preflight_check` | DB status, provider status, credit budget. If anything failed, say what and stop. |
| **Gate 1** | After drafting ICP, before challenge | Scrutinise your own ICP draft — does it actually match what the client does? | The full ICP table (industries, geos, sizes, titles, keywords, exclusions) AND your reasoning for each choice. Flag anything you're uncertain about. |
| **Gate 2** | After ICP challenge, before activation | Analyse the challenge results. Identify contradictions, gaps, and surprises. Propose specific refinements. | Side-by-side: original ICP vs. what the website/client-base analysis revealed. List every proposed change with your confidence level and why. |
| **Gate 3** | Before external company discovery | Plan the search queries. Show what Supabase already has. Estimate credit usage. | Existing Supabase matches, the exact search queries you'll run externally, estimated credits per query. |
| **Gate 4** | Before contact discovery | Confirm target roles/titles/seniorities. | The roles you plan to search for and why. Skip ONLY if the original request explicitly defined exact roles. |
| **Gate 5** | Before enrichment | Check what data Supabase already has. Count contacts, estimate cost for gaps. | Existing data summary, how many contacts need enrichment, estimated credits, current balance. |

**The rule is simple: if it costs credits or shapes the campaign, ask first.**

Never assume the user's intent. Never auto-proceed through a gate. Present your findings clearly and wait for explicit approval.

---

## Required Workflow

Every prospecting engagement MUST follow this pipeline in order. Do not skip steps.

### 0. Preflight (MANDATORY — always run first)

```
gtm_preflight_check      — Tests DB connectivity, provider keys, and credit budget in one call
```

**This is the very first thing you do. No exceptions.**

- If `ready: false` → STOP. Present the blockers to the user. Do NOT proceed.
- If `ready: true` → Present the preflight summary to the user and WAIT for them to confirm before continuing.

Do NOT silently proceed after preflight. The user must see the results and say "go" before you create clients, ICPs, or campaigns.

### 1. Setup

```
gtm_create_client        — Create (or find via gtm_list_clients) the client record
```

### 2. ICP Definition & Challenge

This is the most important stage. A bad ICP poisons everything downstream — wrong companies, wrong contacts, wasted credits. Your job is to be rigorous here, not fast.

#### Step 2a: Research the client BEFORE drafting the ICP

Before you write a single ICP field, do your homework:
- Read the client's website (use WebFetch on their homepage, /about, /pricing, /customers pages)
- Understand: What do they sell? To whom? What size companies? Which industries? Which geographies?
- Look at their existing customer logos / case studies if visible
- Check the campaign brief (if provided) for stated objectives

Do NOT just parrot back what the user said. Cross-reference their brief against what you see on the website. If the user says "target fintech" but their website shows healthcare case studies, that's a flag.

#### Step 2b: Draft the ICP

```
gtm_create_icp           — Define the Ideal Customer Profile
```

**⛔ GATE 1: Present the draft ICP to the user with your reasoning.**

Show a clear table:

| Field | Value | Why |
|-------|-------|-----|
| Industries | e.g. SaaS, Fintech | "Based on your website showing X and brief stating Y" |
| Geographies | e.g. UK, US | "Your case studies are all UK-based, expanding to US per brief" |
| Company size | e.g. 50–500 | "Pricing page suggests mid-market, not enterprise" |
| Target titles | e.g. VP Sales, CRO | "Your product is a sales tool — these are the buyers" |
| Keywords | e.g. revenue operations | "Matches your value prop language" |
| Exclusions | e.g. consulting, agencies | "Not your target based on product fit" |

Flag anything you're unsure about: "I'm not confident about X — your website suggests A but your brief says B. Which is right?"

**Wait for the user to approve or adjust. Do NOT proceed until they confirm.**

#### Step 2c: Challenge the ICP against the website

```
gtm_challenge_icp        — Deep-scrape the client's website to validate ICP assumptions
```

This tool crawls the client's website (homepage, pricing, about, customers, case studies, solutions pages) and compares what it finds against your ICP definition. It generates confidence-scored refinements.

#### Step 2d: Analyse the challenge results and propose refinements

**⛔ GATE 2: Present the challenge findings with a critical eye.**

Your job here is to be the skeptic. Show the user:

1. **Contradictions** — "The ICP says mid-market (50-500), but the website shows logos of companies with 5,000+ employees. Should we expand the size range?"
2. **Missing signals** — "The website heavily features healthcare customers, but the ICP doesn't include healthcare as an industry. Should we add it?"
3. **Confirmations** — "The ICP targets VP Sales — this matches the website's persona language."
4. **Recommended refinements** — For each proposed change, state what you'd change and why, with confidence (high/medium/low).

If the challenge reveals the ICP needs changes:
```
gtm_refine_icp           — Create a new version with the proposed changes
```

Present the refined ICP side-by-side with the original. Explain every change.

**Wait for the user to approve. Do NOT activate without explicit confirmation.**

#### Step 2e: Activate

```
gtm_activate_icp         — Lock in the final ICP (only after human approval)
```

Only call this after the user has explicitly approved the (possibly refined) ICP.

### 3. Company Discovery (layered — Supabase first, then external)

Company discovery follows a strict source order to avoid duplicating effort and burning credits on data you already have.

#### Step 3a: Check Supabase first

Query the existing database (project: `dnepejjdqylzkqefnjbt`) for companies matching the active ICP — by industry, geography, size, and keywords. Present what's already available. This might be enough on its own, or it forms a baseline to supplement externally.

**⛔ GATE 3: Present what Supabase already has. Then present your external search plan: the queries you'll run, which providers, and estimated credits. Wait for approval before spending credits.**

#### Step 3b: Apollo structured search

```
gtm_search_companies     — Runs Apollo (structured) + Exa (semantic) in parallel
```

Apollo has a company directory — it's the first external source. The GTM Engine deduplicates against what's already in Supabase automatically.

#### Step 3c: Exa web search and scraping

`gtm_search_companies` also runs Exa semantic search in parallel with Apollo. This catches companies that aren't in Apollo's directory — startups, niche players, companies with unusual positioning. Run multiple searches with different queries to maximise coverage.

All results are automatically deduplicated by domain and persisted to Supabase.

#### Location-Based Company Search (Supabase)

When filtering or querying discovered companies by location in Supabase, use these approaches in order of preference:

**Preferred: Use the search function** — handles city, state, county, and postal code lookups with automatic fallback:
```sql
SELECT * FROM search_companies_by_location('San Francisco');
SELECT * FROM search_companies_by_location('NY');
SELECT * FROM search_companies_by_location('10001');
```
This searches city/state/county on the company record first. If no match, it falls back to the `postal_codes` lookup table.

**For queries/joins: Use the view** — provides resolved location fields with postal code fallback:
```sql
SELECT resolved_city, resolved_state, resolved_county, resolved_region
FROM companies_with_location
WHERE resolved_state = 'CA';
```
The `companies_with_location` view resolves location from the company's own fields first, falling back to a `postal_codes` JOIN when empty. Always use `resolved_*` columns instead of raw `city`/`state`/`county`/`region`.

**Direct table columns** — fastest, but data may be incomplete during backfill:
The `companies` table has: `city`, `state`, `county`, `region`, `postal_code`, `country`. These are being backfilled from the `postal_codes` lookup table. Once complete, direct queries are faster than the view.

**Reference: Postal codes table**
`postal_codes` contains 42,735 US and 2,856 UK entries with: `postal_code`, `city`, `state`, `county`, `region`, `country_code`.

### 4. TAM Scoring

```
gtm_build_tam            — Score all discovered companies against the ICP, generate tier distribution
```

Do NOT write custom Python scripts to score companies. The engine's TAM builder uses the ICP definition fields directly and produces tier breakdowns, geo/industry/size distributions.

This gives you the full universe of companies ranked by ICP fit.

### 5. Signal Detection → Campaign Buckets

```
gtm_detect_signals       — Scan companies for buying intent (funding, hires, leadership changes, expansions, product launches, acquisitions, news mentions)
```

This is where the mass company list gets broken into actionable segments. Signal detection identifies buying intent — the reason to call.

The output of this step is a set of signal-based buckets: groups of companies that share a common reason to reach out. For example:

- "Companies that recently raised Series B"
- "Companies hiring for VP Sales"
- "Companies expanding into UK market"
- "Companies that just acquired a competitor"

Each bucket becomes a campaign. This is a phone-first activity — you need a reason to call before you create campaigns. Signals provide that reason.

### 6. Campaign Creation (one per signal bucket)

```
gtm_create_campaign      — Create a campaign linked to the client, with targeting criteria
```

NOW you create campaigns — one per signal bucket. Each campaign groups companies that share a common signal/reason to call, so the outreach has a coherent talk track.

**Campaign Naming Convention (MANDATORY):**

Every campaign MUST follow this naming pattern:

```
{UUID}-{Location}-{Sector/Industry}-{Signal}-{Role}
```

Examples:
- `a3f2c1d4-UK-SaaS-SeriesB-VPSales`
- `b7e9a0f1-London-Fintech-NewCROHire-HeadOfRevOps`
- `c5d8b2e3-NYC-HealthTech-Expansion-CFO`
- `d1a4f6c7-US-Manufacturing-ProductLaunch-ProcurementDirector`

This naming convention is essential for retrospective analysis. It enables the team to slice performance data by location, sector, signal type, and role to understand which combinations convert best. Once enough data exists, messaging can be tested and optimised per segment.

Each component:
- **UUID** — unique identifier for the campaign
- **Location** — geographic target (country, city, or region)
- **Sector/Industry** — the vertical being targeted
- **Signal** — the buying intent signal that defines this bucket (e.g. SeriesB, NewHire, Expansion, Acquisition, ProductLaunch)
- **Role** — the target job title/function

Present the proposed campaigns to the user in a table showing: campaign name (using the convention above), signal bucket, company count, and outreach angle. Wait for approval before proceeding to contact discovery.

### 7. Contact Discovery

**⛔ GATE 4 (Role Confirmation):** Before searching for contacts, confirm the target roles/titles/seniorities with the user. The ICP may define broad role criteria, but the user may want to narrow or adjust for specific campaigns. Skip this gate ONLY if the original request explicitly defined the exact roles to target.

```
gtm_search_people        — Find decision-makers at target companies by title, department, seniority
```

Run this per campaign so contacts are properly linked to their campaign/signal bucket.

### 8. Contact Enrichment (layered — check existing data first)

Enrichment follows a strict process to avoid wasting credits on data you already have.

#### Step 8a: Check Supabase for existing data

Query the database for any existing contact data — emails, phone numbers, enrichment history. Present a summary: how many contacts already have emails, how many have phones, how many have gaps.

**⛔ GATE 5: Present what you already have vs what's missing. Show estimated credit cost to fill the gaps. Wait for approval.**

#### Step 8b: Validate existing emails with Million Verifier

```
gtm_bulk_verify_emails   — Verify emails already in the database
```

Before enriching anything new, verify the emails you already have. Remove or flag any that fail verification — there's no point building on bad data.

#### Step 8c: Source phone numbers and fill email gaps

```
gtm_enrich_contact       — Waterfall enrichment: Apollo → Prospeo → Freckle cache, with Million Verifier inline
```

The enrichment waterfall attempts to fill phone number and email gaps. Phone numbers are critical for a phone-first workflow. The waterfall runs Apollo first, then Prospeo to catch what Apollo missed.

#### Step 8d: Present the enriched file to the user

Export the current state and present it for review. The user needs to see the data before deciding which contacts warrant manual enrichment in Freckle.

#### Step 8e: Manual enrichment of priority contacts in Freckle

Freckle is a separate platform with its own Anthropic-powered LLM search/reasoning UI. It is one-way — you push priority contacts into Freckle for manual enrichment, but the enriched data does not sync back automatically.

The user will:
1. Take the priority contacts identified in step 8d into Freckle's UI
2. Manually enrich them using Freckle's LLM-powered search
3. Export the enriched data from Freckle as CSV

#### Step 8f: Reimport Freckle-enriched data to Supabase

After the user completes Freckle enrichment and provides the CSV export, upsert the enriched contact data back into Supabase using `execute_sql`, matching on contact ID or email+name. This closes the loop — all enrichment data lives in one place.

#### Step 8g: Final email verification sweep

```
gtm_bulk_verify_emails   — Final sweep of ALL emails (including any new ones from Freckle) before export
```

### 9. Export

```
gtm_export_campaign      — Export the full campaign (companies + contacts + enrichment) as JSON or CSV
```

This is the deliverable. It pulls from the database, not from flat files you wrote manually. Export per campaign (i.e. per signal bucket) so each deliverable has a coherent outreach angle.

---

## Prohibited Patterns

These patterns indicate the engine is being bypassed. Do NOT do any of the following:

| Do NOT do this | Do this instead |
|---|---|
| Call `apollo_mixed_companies_search` directly | Use `gtm_search_companies` |
| Call `apollo_mixed_people_api_search` directly | Use `gtm_search_people` |
| Call `apollo_people_match` directly | Use `gtm_enrich_contact` |
| Write ad-hoc Python scoring scripts | Use `gtm_build_tam` |
| Write CSVs manually via bash | Use `gtm_export_campaign` |
| Skip ICP challenge | Always run `gtm_challenge_icp` before activating |
| Skip email verification | Always run `gtm_bulk_verify_emails` before export |
| Skip signal detection | Always run `gtm_detect_signals` — signals create the campaign buckets |
| Trust Apollo "verified" emails without waterfall | Use `gtm_enrich_contact` (runs full waterfall) |
| Skip preflight check | Always run `gtm_preflight_check` as the very first step |
| Auto-proceed past a confirmation gate | Always present findings and wait for human approval |
| Assume ICP parameters without asking | Present draft ICP and get explicit approval |
| Search externally without checking Supabase first | Always query Supabase before burning credits on Apollo/Exa |
| Create campaigns before having signals | Campaigns are built from signal-based buckets, not before discovery |
| Assume target roles without confirming | Confirm roles with the user unless already specified in the brief |

### When raw provider tools ARE acceptable

Raw Apollo/Prospeo/Exa MCP tools may only be used for:
- **Debugging** — investigating why a `gtm_*` tool returned unexpected results
- **One-off lookups** — checking a single data point outside a campaign context
- **Skills** — dedicated skills (e.g., `prospeo-full-export`) that have their own documented workflows

They are NEVER acceptable as a substitute for the engine pipeline during a prospecting campaign.

---

## Quality Checklist

Before delivering any campaign output, verify:

- [ ] Preflight check passed (`gtm_preflight_check` returned `ready: true`)
- [ ] ICP was challenged against the client's website (`gtm_challenge_icp`)
- [ ] ICP was approved and activated (`gtm_activate_icp`)
- [ ] Supabase was checked for existing companies before external search
- [ ] Companies were discovered via layered approach: Supabase → Apollo → Exa (not raw Apollo)
- [ ] TAM was scored via `gtm_build_tam` (not a custom script)
- [ ] Signals were detected and used to create campaign buckets (`gtm_detect_signals`)
- [ ] Campaigns were created per signal bucket with correct naming convention
- [ ] Target roles were confirmed with the user before contact search
- [ ] Supabase was checked for existing contact data before enrichment
- [ ] Existing emails were verified with Million Verifier before enriching new data
- [ ] Contacts were enriched via `gtm_enrich_contact` (waterfall, not single-source)
- [ ] Priority contacts were flagged for Freckle manual enrichment
- [ ] Freckle-enriched data was reimported to Supabase
- [ ] Final email verification sweep completed (`gtm_bulk_verify_emails`)
- [ ] Export produced per campaign via `gtm_export_campaign`
- [ ] `gtm_get_cost_summary` checked before and after enrichment

---

## Skills

Skill documentation lives in `skills/`. Each skill has its own `SKILL.md` with usage instructions. Skills are self-contained workflows that may use raw provider APIs directly — this is acceptable because the skill docs define their own quality controls.

Available skills:
- `cold-email-copy-grader` — Grade and improve cold email copy
- `domain-setup-dynadot-zapmail` — Configure sending domains
- `google-maps-scraper` — Scrape Google Maps for local business data
- `prospeo-full-export` — Bulk export from Prospeo

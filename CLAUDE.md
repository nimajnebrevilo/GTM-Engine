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
| **Gate 3** | Before company discovery | Plan the search queries. Estimate credit usage. | Campaign targeting, the exact search queries you'll run, estimated credits per query. |
| **Gate 4** | Before enrichment | Count contacts, estimate cost. | How many contacts, estimated credits, current balance. |

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

### 3. Campaign Creation

```
gtm_create_campaign      — Create a campaign linked to the client, with targeting criteria
```

**⛔ CONFIRMATION GATE 3: Present the campaign plan BEFORE running company discovery.**
Show them: campaign name, targeting criteria, search queries you plan to run, estimated credit usage.
Ask: "Ready to start company discovery? This will use Apollo + Exa credits."
Wait for their response.

### 4. Company Discovery

```
gtm_search_companies     — Runs Exa (semantic) + Apollo (structured) in parallel, auto-deduplicates, upserts to DB
```

This is NOT the same as calling `apollo_mixed_companies_search` directly. The engine:
- Runs two providers in parallel for broader coverage
- Deduplicates by domain automatically
- Persists all results to Supabase
- Links companies to the campaign

Run multiple searches with different queries to maximize coverage. Each call can return up to 25 results per provider.

### 5. Signal Detection

```
gtm_detect_signals       — Scan each high-priority company for buying intent (funding, hires, leadership changes, expansions)
```

This step is mandatory for Tier 1 companies. Signals drive personalized outreach angles.

### 6. TAM Scoring

```
gtm_build_tam            — Score all discovered companies against the ICP, generate tier distribution
```

Do NOT write custom Python scripts to score companies. The engine's TAM builder uses the ICP definition fields directly and produces tier breakdowns, geo/industry/size distributions.

### 7. Contact Discovery

```
gtm_search_people        — Find decision-makers at target companies by title, department, seniority
```

### 8. Contact Enrichment

**⛔ CONFIRMATION GATE 4: Present the enrichment plan BEFORE enriching.**
Show them: how many contacts you plan to enrich, estimated credit cost, current credit balance.
Ask: "Ready to enrich N contacts? This will use approximately X Apollo + Y Prospeo credits."
Wait for their response.

```
gtm_enrich_contact       — Waterfall enrichment: Apollo → Prospeo → Freckle, with Million Verifier inline
gtm_bulk_verify_emails   — Final sweep of all emails before export
```

The enrichment waterfall exists because no single provider has complete or accurate data. Do NOT rely on Apollo alone — its "verified" flag is insufficient. Always run `gtm_bulk_verify_emails` as the final step before export.

### 9. Export

```
gtm_export_campaign      — Export the full campaign (companies + contacts + enrichment) as JSON or CSV
```

This is the deliverable. It pulls from the database, not from flat files you wrote manually.

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
| Skip signal detection for Tier 1 companies | Always run `gtm_detect_signals` |
| Trust Apollo "verified" emails without waterfall | Use `gtm_enrich_contact` (runs full waterfall) |
| Skip preflight check | Always run `gtm_preflight_check` as the very first step |
| Auto-proceed past a confirmation gate | Always present findings and wait for human approval |
| Assume ICP parameters without asking | Present draft ICP and get explicit approval |

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
- [ ] Campaign record exists (`gtm_list_campaigns`)
- [ ] Companies were discovered via `gtm_search_companies` (not raw Apollo)
- [ ] Tier 1 companies have signal detection results (`gtm_detect_signals`)
- [ ] TAM was scored via `gtm_build_tam` (not a custom script)
- [ ] Contacts were enriched via `gtm_enrich_contact` (waterfall, not single-source)
- [ ] All emails passed `gtm_bulk_verify_emails`
- [ ] Final export produced via `gtm_export_campaign`
- [ ] `gtm_get_cost_summary` checked before and after enrichment

---

## Skills

Skill documentation lives in `skills/`. Each skill has its own `SKILL.md` with usage instructions. Skills are self-contained workflows that may use raw provider APIs directly — this is acceptable because the skill docs define their own quality controls.

Available skills:
- `cold-email-copy-grader` — Grade and improve cold email copy
- `domain-setup-dynadot-zapmail` — Configure sending domains
- `google-maps-scraper` — Scrape Google Maps for local business data
- `prospeo-full-export` — Bulk export from Prospeo

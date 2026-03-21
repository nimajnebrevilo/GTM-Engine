"""
GTM Agent — Claude as master driver of the GTM Engine pipeline.

Modes:
  - Autonomous: For known clients with existing ICP, runs the full pipeline end-to-end.
  - Interactive: For new campaigns, Claude analyses brief/website, challenges ICP,
    and pauses for human review before proceeding.

Usage:
  python -m gtm_agent.agent "Run a campaign for Acme Corp targeting UK mid-market SaaS"
  python -m gtm_agent.agent --interactive "New campaign for client X"
"""

import json
import os
import sys
from typing import Any

import anthropic
from dotenv import load_dotenv
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel
from rich.prompt import Prompt

from gtm_agent import engine
from gtm_agent.tools import TOOLS

load_dotenv()
console = Console()

MODEL = os.getenv("GTM_AGENT_MODEL", "claude-sonnet-4-6")
MAX_TURNS = int(os.getenv("GTM_AGENT_MAX_TURNS", "50"))

SYSTEM_PROMPT = """\
You are the GTM Engine orchestrator — an expert B2B demand generation agent \
that drives a 6-stage pipeline to build targeted prospect lists.

## Your Pipeline
1. **Client & Campaign Setup** — Create or identify the client and campaign
2. **ICP Definition** — Define the Ideal Customer Profile (industries, geographies, company sizes, keywords, roles)
3. **Company Discovery** — Search for matching companies via Exa (semantic) + Apollo (structured)
4. **Signal Detection** — Scan top companies for buying intent signals (funding, hiring, expansion)
5. **People Search** — Find decision-makers at qualified companies
6. **Enrichment** — Get verified emails + phones via the enrichment waterfall
7. **Export** — Deliver the final campaign data

## Behaviour Rules
- **Known clients** (existing ICP): Skip to company discovery, run autonomously.
- **New campaigns**: Analyse the brief, research the client website, challenge ICP assumptions, \
  then STOP and present your proposed ICP to the human for approval before proceeding.
- Always check `get_engine_status` first to know which providers are available.
- Always check `get_cost_summary` before expensive operations (enrichment, bulk search).
- When searching for companies, craft rich natural-language queries for Exa and use structured Apollo filters.
- For people search, use the target roles from the active ICP.
- Process enrichment in batches — don't try to enrich hundreds of contacts at once.
- Present results clearly: how many companies found, tier distribution, key signals, cost impact.

## ICP Challenge Process (New Campaigns Only)
When defining an ICP for a new campaign:
1. Analyse the client's website to understand their value prop, target personas, pricing signals
2. Review the campaign brief for explicit targeting criteria
3. Draft an initial ICP based on your analysis
4. Challenge your own assumptions: Are the industries too broad? Too narrow? \
   Missing adjacent verticals? Are the geographies realistic for the company's stage?
5. Present the proposed ICP with your reasoning and any concerns
6. Wait for human approval or refinement instructions

## Output Style
- Be concise and action-oriented
- Show numbers: "Found 47 companies, 32 Tier 1 (68% fit)"
- Flag risks: "Apollo budget at 73% — 2,700 credits remaining"
- When pausing for human input, be specific about what you need
"""


def execute_tool(name: str, args: dict[str, Any]) -> Any:
    """Route a tool call to the corresponding engine function."""
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

    fn = dispatch.get(name)
    if not fn:
        return {"error": f"Unknown tool: {name}"}

    try:
        return fn()
    except engine.EngineError as e:
        return {"error": str(e), "stderr": e.stderr}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}


def run_agent(user_message: str, interactive: bool = True) -> None:
    """Run the Claude agent loop until completion or human input needed."""
    client = anthropic.Anthropic()
    messages: list[dict[str, Any]] = [{"role": "user", "content": user_message}]

    console.print(Panel(f"[bold]Task:[/bold] {user_message}", title="GTM Agent", border_style="blue"))

    for turn in range(MAX_TURNS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=8192,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )

        # Collect assistant content blocks
        assistant_content = response.content
        messages.append({"role": "assistant", "content": assistant_content})

        # Process each block
        tool_results = []
        has_text = False

        for block in assistant_content:
            if block.type == "text" and block.text.strip():
                has_text = True
                console.print()
                console.print(Markdown(block.text))

            elif block.type == "tool_use":
                tool_name = block.name
                tool_input = block.input

                # Show what we're doing
                console.print(f"\n[dim]> {tool_name}({json.dumps(tool_input, indent=None)[:200]})[/dim]")

                result = execute_tool(tool_name, tool_input)

                # Show result summary
                if isinstance(result, dict) and "error" in result:
                    console.print(f"  [red]Error: {result['error']}[/red]")
                elif isinstance(result, list):
                    console.print(f"  [green]OK[/green] ({len(result)} items)")
                elif isinstance(result, dict):
                    console.print(f"  [green]OK[/green]")
                else:
                    console.print(f"  [green]OK[/green]")

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, default=str),
                })

        # If there were tool calls, send results back
        if tool_results:
            messages.append({"role": "user", "content": tool_results})
            continue

        # If Claude stopped (end_turn) with text, we're done or need human input
        if response.stop_reason == "end_turn":
            if has_text and interactive:
                # Check if Claude is asking for input
                last_text = ""
                for block in assistant_content:
                    if block.type == "text":
                        last_text = block.text

                if any(phrase in last_text.lower() for phrase in [
                    "would you like", "do you want", "please confirm",
                    "your approval", "your feedback", "let me know",
                    "shall i", "should i", "what do you think",
                    "ready to proceed", "approve", "refine",
                ]):
                    console.print()
                    human_input = Prompt.ask("[bold cyan]Your response[/bold cyan]")
                    if human_input.lower() in ("quit", "exit", "q"):
                        console.print("[yellow]Session ended.[/yellow]")
                        return
                    messages.append({"role": "user", "content": human_input})
                    continue

            # Agent is done
            console.print("\n[bold green]Pipeline complete.[/bold green]")
            return

    console.print(f"\n[yellow]Reached max turns ({MAX_TURNS}). Session ended.[/yellow]")


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        console.print("[bold]GTM Agent[/bold] — Claude-powered pipeline orchestrator\n")
        console.print("Usage: python -m gtm_agent.agent <task description>")
        console.print("       python -m gtm_agent.agent --auto <task>  (non-interactive mode)")
        console.print()
        console.print("Examples:")
        console.print('  python -m gtm_agent.agent "Run a campaign for Acme Corp targeting UK SaaS"')
        console.print('  python -m gtm_agent.agent "Enrich contacts for campaign abc-123"')
        console.print('  python -m gtm_agent.agent "Detect signals for stripe.com"')
        sys.exit(0)

    interactive = "--auto" not in sys.argv
    task_parts = [a for a in sys.argv[1:] if a != "--auto"]
    task = " ".join(task_parts)

    run_agent(task, interactive=interactive)


if __name__ == "__main__":
    main()

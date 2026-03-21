#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Create .env with API keys if missing
if [ -f "$CLAUDE_PROJECT_DIR/.claude/hooks/create-env.sh" ]; then
  bash "$CLAUDE_PROJECT_DIR/.claude/hooks/create-env.sh"
fi

npm install

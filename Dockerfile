FROM node:20-slim AS node-deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------

FROM python:3.11-slim

# Install Node.js (needed for npx tsx)
COPY --from=node:20-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:20-slim /usr/local/bin/npx /usr/local/bin/npx
COPY --from=node:20-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

WORKDIR /app

# Python deps
COPY pyproject.toml ./
RUN pip install --no-cache-dir ".[remote]"

# Node deps (pre-built)
COPY --from=node-deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Application code
COPY gtm_agent/ ./gtm_agent/
COPY src/ ./src/
COPY tsconfig.json ./

ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8080
EXPOSE 8080

CMD ["python3", "-m", "gtm_agent.mcp_remote"]

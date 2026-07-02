FROM texlive/texlive:TL2025-historic

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg python3-pygments \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && latexmk --version && biber --version | head -1 && node --version

# Build context is the repo root so the pnpm workspace (incl. shared
# @opengalley/eslint-config) resolves correctly.
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY api/package.json ./api/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --no-frozen-lockfile --filter opengalley-api...
COPY api/tsconfig.json ./api/
COPY api/src ./api/src
COPY packages/eslint-config ./packages/eslint-config
RUN pnpm --filter opengalley-api run build

ENV NODE_ENV=production
WORKDIR /app/api
EXPOSE 4000
CMD ["node", "dist/index.js"]

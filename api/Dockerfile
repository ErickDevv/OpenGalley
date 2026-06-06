FROM texlive/texlive:TL2025-historic

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg python3-pygments \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && latexmk --version && biber --version | head -1 && node --version

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm run build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/index.js"]

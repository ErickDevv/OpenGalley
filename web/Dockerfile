FROM node:20-bookworm-slim AS build
RUN corepack enable

# Build context is the repo root so the pnpm workspace (incl. shared
# @opengalley/eslint-config) resolves correctly.
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
COPY web/package.json ./web/
COPY packages/eslint-config/package.json ./packages/eslint-config/
RUN pnpm install --no-frozen-lockfile --filter opengalley-web...
COPY web ./web
COPY packages/eslint-config ./packages/eslint-config
RUN pnpm --filter opengalley-web run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80

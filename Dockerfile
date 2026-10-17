FROM node:24-alpine AS build

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY indexer/package.json indexer/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @dlfp/frontend build

FROM node:24-alpine AS runtime

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY indexer/package.json indexer/package.json
RUN pnpm install --prod --frozen-lockfile --filter @dlfp/backend --filter @dlfp/indexer

COPY backend/src backend/src
COPY --from=build /workspace/indexer/src indexer/src
COPY --from=build /workspace/frontend/dist frontend/dist

ENV HOST=0.0.0.0
ENV PORT=3000
ENV NODE_ENV=production
ENV FRONTEND_DIST_DIR=/app/frontend/dist

EXPOSE 3000
CMD ["node", "backend/src/server.ts"]

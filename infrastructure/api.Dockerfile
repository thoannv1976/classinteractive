# Container image for the ClassInteract API (Cloud Run). Build from the repository root:
#   docker build -f infrastructure/api.Dockerfile -t classinteract-api .
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tests/package.json tests/
RUN pnpm install --frozen-lockfile --filter @classinteract/api... --ignore-scripts=false
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @classinteract/api build \
 && pnpm --filter @classinteract/api deploy --prod --legacy /out

FROM node:22-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /out/package.json ./package.json
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]

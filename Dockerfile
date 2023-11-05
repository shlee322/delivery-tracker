FROM node:20-alpine AS base
RUN npm install -g pnpm@8

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

FROM base AS prod-deps
WORKDIR /app
COPY . /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN apk update && apk --no-cache add \
  python3 \
  make \
  g++
WORKDIR /app
COPY . /app
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @delivery-tracker/server build-with-deps

FROM prod-deps
COPY --from=build /app/packages/api/dist /app/packages/api/dist
COPY --from=build /app/packages/core/dist /app/packages/core/dist
COPY --from=build /app/packages/server/dist /app/packages/server/dist

WORKDIR /app/packages/server

ENV NODE_ENV=production
CMD ["pnpm", "start"]

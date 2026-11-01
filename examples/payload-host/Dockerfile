FROM node:24-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN mkdir -p /app/dist-pkg && npm pack --ignore-scripts --pack-destination /app/dist-pkg

FROM base AS host-builder
WORKDIR /app/examples/payload-host
COPY --from=builder /app/dist-pkg/*.tgz /tmp/helmdeck.tgz
COPY examples/payload-host ./
RUN sed -i 's#"@yesvus/helmdeck": "file:../.."#"@yesvus/helmdeck": "file:/tmp/helmdeck.tgz"#' package.json
RUN printf '# undici 7.30.1 is broken: new CacheStorage throws Illegal constructor; workspace lockfile resolves 7.29.1.\noverrides:\n  undici: 7.29.1\nallowBuilds:\n  esbuild: true\n' > pnpm-workspace.yaml
RUN pnpm install --no-frozen-lockfile
# Build-only placeholders satisfy config loading during next build. They are not runtime secrets.
ENV PAYLOAD_SECRET=build-only-placeholder-not-a-secret
ENV HELMDECK_SESSION_SECRET=build-only-placeholder-not-a-secret
RUN pnpm run build
RUN pnpm prune --prod

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/package.json ./package.json
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/node_modules ./node_modules
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/.next ./.next
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/next.config.mjs ./next.config.mjs
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/payload.config.ts ./payload.config.ts
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/tsconfig.json ./tsconfig.json
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/lib ./lib
COPY --from=host-builder --chown=nextjs:nodejs /app/examples/payload-host/payload-migrations ./payload-migrations
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/ >/dev/null || exit 1
CMD ["sh", "-c", "./node_modules/.bin/payload migrate --disable-transpile && ./node_modules/.bin/next start"]

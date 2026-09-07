FROM node:22-alpine AS deps
WORKDIR /app
# .npmrc must land before any npm command runs, so the registry mirror
# (registry.npmjs.org is unreachable from this deploy host) is already
# active for every install below.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

EXPOSE 3000
USER node

# node:alpine ships neither curl nor wget, so a platform-injected
# curl-based healthcheck would always fail and could cause restarts
# (which would also invalidate any session issued without a stable
# APP_SECRET). Use Node itself to hit /healthz instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get({host:'127.0.0.1',port:process.env.PORT||3000,path:'/healthz',timeout:4000},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]

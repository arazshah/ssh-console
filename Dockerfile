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
CMD ["node", "server/index.js"]

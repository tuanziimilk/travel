# ============================================================
# Stage 1: builder
# Install all dependencies and build web + api
# ============================================================
FROM node:22-alpine AS builder

WORKDIR /app
ENV YARN_IGNORE_ENGINES=1

COPY package.json yarn.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/trpc/package.json packages/trpc/

RUN yarn install --frozen-lockfile

COPY . .

RUN yarn build


# ============================================================
# Stage 2: api
# Production image for API only
# ============================================================
FROM node:22-alpine AS api

WORKDIR /app
ENV NODE_ENV=production

# mysql2 is externalized by esbuild, so install it separately.
RUN npm init -y && npm install mysql2@"^3.12.0" --omit=dev

COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/skills ./skills

EXPOSE 3001

CMD ["node", "--max-old-space-size=768", "dist/server.js"]


# ============================================================
# Stage 3: web
# Optional nginx image for static web assets
# ============================================================
FROM nginx:1.27-alpine AS web

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY nginx/sc-quality-scoring.conf /etc/nginx/conf.d/default.conf

EXPOSE 80


# ============================================================
# Stage 4: migrate
# Run database migrations
# ============================================================
FROM builder AS migrate

WORKDIR /app

CMD ["yarn", "workspace", "@about-demo/api", "db:migrate"]

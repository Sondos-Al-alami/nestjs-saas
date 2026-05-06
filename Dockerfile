# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/auth-org-service/src/generated ./apps/auth-org-service/src/generated
COPY --from=builder /app/apps/course-service/src/generated ./apps/course-service/src/generated
COPY --from=builder /app/apps/analytics-webhook-service/src/generated ./apps/analytics-webhook-service/src/generated
COPY --from=builder /app/apps/auth-org-service/prisma ./apps/auth-org-service/prisma
COPY --from=builder /app/apps/course-service/prisma ./apps/course-service/prisma
COPY --from=builder /app/apps/analytics-webhook-service/prisma ./apps/analytics-webhook-service/prisma
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

# Strip Windows CRLF so the shebang is /bin/sh, not /bin/sh^M (fixes "no such file or directory")
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod +x /app/docker-entrypoint.sh

ARG APP_NAME=api-gateway
ENV APP_NAME=$APP_NAME

ENTRYPOINT ["/app/docker-entrypoint.sh"]

# NestJS SaaS LMS

Multi-tenant LMS SaaS backend built with NestJS and a microservice architecture.
The project is designed for B2B organizations where each tenant has isolated users,
courses, lessons, enrollments, and role-based access.

## Project Description

This repository contains a backend platform with:

- `api-gateway` as the public HTTP entrypoint
- `auth-org-service` for authentication, tenant/org setup, invites, and sessions
- `course-service` for courses, lessons, and enrollments
- `analytics-webhook-service` for event ingestion, webhook delivery, retries, and DLQ workflows
- shared contracts and utilities in `libs/common`

The system enforces tenant context (`x-tenant-id`) and role permissions across
protected routes.

## Current Features (Implemented)

- Multi-tenant request flow with tenant context propagation
- JWT authentication with role-aware authorization guards
- Access + refresh token flow with refresh rotation
- Logout and logout-all session invalidation
- Tenant registration and organization invite flow
- Role restrictions on privileged endpoints (Super Admin, Org Admin, Instructor, Learner)
- Course CRUD with tenant isolation
- Lesson CRUD under courses
- Enrollment management:
  - assign learner to course
  - list enrollments by course and by current user
  - learner/staff-safe enrollment read
  - progress updates (`progressPercent`, `lessonsCompleted`, `completed`, `touchAccess`)
- Subscription-tier guard for course creation limits
- Stripe billing lifecycle:
  - webhook processing with replay/idempotency protection
  - tenant tier/seat entitlement sync from Stripe events
  - billing ops summary endpoint for operational visibility
- Seat-based enforcement:
  - free tier seat cap (env-configurable)
  - grace window support for over-limit seats
- Analytics and webhook platform:
  - learning event capture (lesson started/completed, course completed, certification earned)
  - idempotent event buffering with delivery status tracking
  - retry worker with exponential backoff + jitter and circuit-breaker behavior
  - dead-letter queue listing and requeue flow
  - admin reports (completions, engagement, event volume)
- Production hardening:
  - gateway rate limiting (per-IP and per-tenant)
  - JSON/urlencoded payload size limits
  - structured request/error logging and gateway metrics
  - liveness/readiness/alerts operational endpoints
  - deployment and incident response runbooks

## API Routes

All routes below are exposed by the API gateway.

### Public Routes

- `GET /`
- `GET /internal/downstream-health`
- `GET /internal/ops/health`
- `GET /internal/ops/readiness`
- `GET /internal/ops/metrics`
- `GET /internal/ops/alerts`
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/invites/accept`

### Auth and Tenant Routes (Protected)

- `POST /auth/logout-all`
- `GET /tenant/echo`
- `GET /tenant/auth-echo`
- `POST /org/invites` (Org Admin or Super Admin)
- `GET /billing/ops/summary` (Super Admin)

### Course and Lesson Routes (Protected)

- `GET /courses`
- `POST /courses`
- `GET /courses/:courseId`
- `PATCH /courses/:courseId`
- `DELETE /courses/:courseId`
- `GET /courses/:courseId/lessons`
- `POST /courses/:courseId/lessons`
- `GET /courses/:courseId/lessons/:lessonId`
- `PATCH /courses/:courseId/lessons/:lessonId`
- `DELETE /courses/:courseId/lessons/:lessonId`

### Enrollment Routes (Protected)

- `POST /courses/:courseId/enrollments`
- `GET /courses/:courseId/enrollments`
- `GET /me/enrollments`
- `GET /enrollments/:enrollmentId`
- `PATCH /enrollments/:enrollmentId`
- `DELETE /enrollments/:enrollmentId`

### Analytics Routes (Protected: Org Admin or Super Admin)

- `GET /analytics/events`
- `GET /analytics/reports/completions`
- `GET /analytics/reports/engagement`
- `GET /analytics/reports/event-volume`
- `GET /analytics/dlq`
- `POST /analytics/dlq/:deadLetterId/requeue`
- `POST /analytics/webhook-endpoint`

## Setup

```bash
# 1) Install dependencies
npm install

# 2) Create root runtime env
cp .env.example .env

# 3) Create Prisma env files (one DATABASE_URL per service)
cp apps/auth-org-service/prisma/.env.example apps/auth-org-service/prisma/.env
cp apps/course-service/prisma/.env.example apps/course-service/prisma/.env
cp apps/analytics-webhook-service/prisma/.env.example apps/analytics-webhook-service/prisma/.env

# 4) Generate Prisma clients
npm run prisma:generate:all

# 5) Apply local DB migrations
npm run prisma:migrate:auth
npm run prisma:migrate:course
npm run prisma:migrate:analytics
```

## Run (Development)

```bash
# Runs api-gateway + auth-org-service + course-service + analytics-webhook-service
npm run dev
```

## Run (Single Service)

```bash
npm run start:gateway:dev
npm run start:auth-org:dev
npm run start:course:dev
npm run start:analytics:dev
```

## Production Notes

```bash
# Build all packages
npm run build

# Deploy-time migrations (non-destructive)
npm run prisma:migrate:deploy:auth
npm run prisma:migrate:deploy:course
npm run prisma:migrate:deploy:analytics
```

After startup, verify operational endpoints:

- `GET /internal/ops/health`
- `GET /internal/ops/readiness`
- `GET /internal/ops/alerts`
- `GET /internal/downstream-health`

For Stripe local webhook testing, configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
and expose `auth-org-service` webhook route: `POST /webhooks/stripe`.

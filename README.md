# NestJS SaaS LMS

Multi-tenant LMS SaaS backend built with NestJS and a microservice architecture.
The project is designed for B2B organizations where each tenant has isolated users,
courses, lessons, enrollments, and role-based access.

## Project Description

This repository contains a backend platform with:

- `api-gateway` as the public HTTP entrypoint
- `auth-org-service` for authentication, tenant/org setup, invites, and sessions
- `course-service` for courses, lessons, and enrollments
- `analytics-webhook-service` scaffold for future analytics/webhook delivery
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

## API Routes

All routes below are exposed by the API gateway.

### Public Routes

- `GET /`
- `GET /internal/downstream-health`
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

## Not Yet Implemented (Roadmap Highlights)


- Analytics events pipeline (lesson started/completed, course completed, certifications)
- Reliable webhook delivery system (idempotency, retries/backoff, DLQ)
- Full Stripe billing lifecycle:
  - subscription/invoice webhook sync hardening
  - seat enforcement policies for over-limit scenarios
- Production hardening:
  - rate limiting and payload protections
  - metrics/tracing/observability across services
  - secret rotation and backup/restore runbooks
- Product polish:
  - email notifications (invites/completions)
  - compliance flows (tenant data export/delete, retention policy)

## Setup

```bash
npm install
```

## Run

```bash
# development
npm run start:dev

# production
npm run start:prod
```


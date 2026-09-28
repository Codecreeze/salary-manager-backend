# Engineering Rules for This Project

Repo-specific rules. These take precedence over generic defaults for anyone
(human or AI) working in this repo.

## KISS
- REST over GraphQL, SQLite over Postgres, no message queue, no
  microservices. One backend service, one frontend app. If a simpler option
  solves the requirement, use it.
- No premature auth, no multi-tenancy, no i18n framework — none are required
  by the brief.

## DRY
- One `PrismaService`, injected via NestJS DI — never instantiate
  `PrismaClient` per module.
- One source of truth for "current salary" (latest `SalaryRecord` by
  `effectiveDate`) — implemented once in the service layer, reused by both
  the employee-detail endpoint and analytics endpoints, never recomputed
  ad hoc in a controller or in the frontend.
- Shared DTO/response TypeScript types are written once in the backend and
  mirrored in `frontend/src/api/types.ts`; RTK Query endpoints reference
  those types instead of `any`.
- Filter/pagination query-building logic lives in one Prisma `where`-builder
  helper in `EmployeesService`, reused by the list endpoint and (if needed)
  export/count logic — not copy-pasted per query.

## YAGNI
- Don't build CSV import/export, org charts, approval workflows, or
  currency conversion — see PRD "Scope (out)" for the reasoning per item.
- Don't add a caching layer (Redis) for 10,000 rows on SQLite — the DB and
  RTK Query's client cache are enough.
- Don't add Nx/Turborepo for a two-app repo.

## Code structure
- Backend: controller → service → Prisma. Controllers never call Prisma
  directly. Services never import `@nestjs/common` HTTP decorators.
- Frontend: no component file mixes data-fetching, business logic, and a
  page-sized JSX tree. Split: page (composition) → feature components
  (presentation) → RTK Query hooks (data).
- **No inline styles anywhere** (`style={{...}}` is not used); use MUI's
  `sx` prop, `styled()`, or the shared theme.
- Every exported component/service/util has a narrow, single responsibility;
  if a file is doing two unrelated things, split it.

## Testing
- Backend: Jest unit tests for every service's business logic (validation,
  latest-salary resolution, aggregation math) with an in-memory/test SQLite
  DB — no mocking Prisma into meaninglessness. Controller tests via
  Supertest for the HTTP contract (status codes, validation errors).
- Frontend: React Testing Library tests for feature components (rendering,
  filter interaction, form validation) and for RTK Query hooks' loading/
  error/success states. No snapshot-only tests — assert behavior.
- Tests must be deterministic: seeded faker data, no reliance on real
  system time without freezing it, no network calls in unit tests.

## AI usage
- AI tools are used to accelerate scaffolding, boilerplate (DTOs, Prisma
  schema, MUI components, test scaffolds) and to challenge design decisions.
- Every AI-assisted change is reviewed against this file and the TRD before
  being accepted — AI output is a draft, not an approval.
- See `docs/AI_PROMPTS.md` for the prompts/instructions used.

# Architecture

## System shape
```
┌────────────────────┐        REST/JSON        ┌──────────────────────────┐
│  frontend/ (React)  │  ───────────────────▶  │  backend/ (NestJS)       │
│  Redux Toolkit +    │  ◀───────────────────  │  Controllers → Services  │
│  RTK Query (cache)  │                         │  → Prisma → SQLite file │
│  MUI components     │                         │  class-validator DTOs   │
└────────────────────┘                         └──────────────────────────┘
```
Two independently runnable apps. No shared package/monorepo tooling (Nx,
Turborepo) — two apps and one contract don't need a build orchestrator
(YAGNI); the TRD's API contract is the integration point.

## Backend module boundaries (NestJS)
- `EmployeesModule` — CRUD + list/search/filter + salary-history sub-resource.
  Owns `Employee` and `SalaryRecord` read/write logic.
- `AnalyticsModule` — read-only aggregation queries. Kept separate from
  `EmployeesModule` because it has a different job (reporting, not
  transactional CRUD) and different performance shape (aggregate SQL, not
  row-level access) — separation of concerns, not premature abstraction.
- `LookupsModule` — `Department` / `Country` read endpoints for dropdowns.
- `PrismaModule` — single `PrismaService`, injected everywhere; one DB
  connection lifecycle, no per-module client instantiation (DRY).
- `SeedScript` — standalone script (`prisma/seed.ts`), not a controller
  endpoint. Seeding is a dev/setup operation, never something the running
  API should expose (would be a destructive-action footgun in production).

Each module: `*.controller.ts` (HTTP + DTO validation) → `*.service.ts`
(business logic, testable without HTTP) → Prisma. Controllers stay thin;
services are the unit-test surface.

## Frontend structure
```
src/
  app/            store.ts, hooks.ts (typed useAppDispatch/useAppSelector)
  api/            RTK Query API slices (employeesApi, analyticsApi, lookupsApi)
  features/
    employees/    EmployeeListPage, EmployeeDetailPage, EmployeeFormPage
                    + components/ (EmployeeTable, EmployeeFilters, SalaryHistoryTable, ...)
    analytics/    DashboardPage + components/ (SummaryCards, DeptChart, ...)
  components/     shared/layout components (AppLayout, NavBar, PageHeader, EmptyState, ErrorState)
  routes/         AppRouter.tsx (React Router route table)
  theme/          MUI theme.ts (no ad-hoc styling per component)
```
Rules enforced across this tree:
- **No inline `style={{...}}`.** Use MUI's `sx` prop or `styled()`/theme —
  MUI's own styling API, not raw inline styles, and not a second CSS system
  on top of it.
- **Every list item / table row / chart card is its own component file** —
  no 200-line page components. A page component composes; it doesn't render.
- **Server state (employees, analytics) lives in RTK Query's cache, not
  Redux slices** — client/UI state (filters, selected row, modal open) is the
  only thing in hand-written slices. Avoids the classic duplication of
  "fetch into a slice, then also cache it" (DRY).

## Key trade-offs
| Decision | Alternative considered | Why this way |
|---|---|---|
| SQLite via Prisma | Postgres | Assignment allows "relational DB of your choice"; SQLite needs zero infra to run/seed/demo and is trivial to reset. Prisma makes swapping to Postgres later a one-line datasource change. |
| Salary as append-only history table | Single `salary` column on Employee | HR's real question is "how has pay changed," and a raise must be auditable — an overwrite loses that. Slightly more query complexity (latest-per-employee) for real correctness. |
| Server-side pagination/aggregation | Ship all 10k rows, filter in browser | 10,000 rows of employee+salary data client-side is slow to render/filter and doesn't scale; DB does this well already. |
| No auth in v1 | Basic login | Single named persona, no multi-tenant/role requirement in the brief; fake auth adds surface area without real security value (see PRD scope-out). |
| REST, not GraphQL | GraphQL | One consumer (this UI), fixed set of aggregate endpoints — GraphQL's flexibility isn't needed and adds resolver/schema overhead (YAGNI). |

## Performance considerations
- Indexes on `Employee.departmentId`, `Employee.countryId`, `Employee.email`,
  `SalaryRecord(employeeId, effectiveDate)`.
- Analytics endpoints use SQL `GROUP BY` aggregation (via Prisma
  `groupBy`/raw SQL for median), never "load all rows and reduce in Node."
- Employee list always paginated (`page`/`pageSize`, default 25, max 100).
- RTK Query caches list/detail responses and invalidates by tag on
  create/update, avoiding redundant refetches.

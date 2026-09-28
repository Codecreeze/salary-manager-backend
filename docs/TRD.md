# TRD — Technical Requirements & API Contract

## Stack
- **Backend**: NestJS + TypeScript, Prisma ORM, SQLite (file DB) — relational,
  zero-ops, trivially seedable, adequate for 10k rows with proper indexes.
- **Frontend**: React 19 + TypeScript + Vite, React Router, Redux Toolkit +
  RTK Query (server state/cache), MUI (component library).
- **Testing**: Jest + Supertest (backend service/controller/integration
  tests), Jest + React Testing Library (frontend component/hook tests).
- **Monorepo layout**: `backend/`, `frontend/`, `docs/` — independent
  deployables, no shared build step required.

## Data model (Prisma, SQLite)

```
Department   { id, name (unique) }
Country      { id, name (unique), code (ISO-2, unique) }
Employee     {
  id, employeeCode (unique, e.g. EMP-00001), firstName, lastName, email (unique),
  departmentId -> Department, countryId -> Country,
  jobLevel (enum: L1..L6), employmentStatus (ACTIVE | INACTIVE),
  managerId -> Employee? (self-relation, nullable),
  hireDate, createdAt, updatedAt
}
SalaryRecord {
  id, employeeId -> Employee, amount (int, minor units avoided: store as
  integer whole-currency-unit), currency (ISO-4217, e.g. USD/EUR/INR),
  effectiveDate, reason (enum: HIRE | PROMOTION | MERIT | MARKET_ADJUSTMENT |
  CORRECTION), createdAt
}
```
Current salary for an employee = latest `SalaryRecord` by `effectiveDate`
(indexed on `employeeId, effectiveDate`). This makes every change auditable
instead of overwriting a single `salary` column — the one modeling decision
worth calling out, since it shapes both the write path (create a record,
never `UPDATE salary`) and analytics (must always join to the *latest*
record per employee).

Indexes: `Employee(departmentId)`, `Employee(countryId)`, `Employee(email)`,
`SalaryRecord(employeeId, effectiveDate)` — required for the list/filter and
analytics queries to stay fast at 10k rows.

## REST API

```
GET    /employees?search=&departmentId=&countryId=&jobLevel=&status=&page=&pageSize=&sortBy=
GET    /employees/:id                 -> employee + current salary + salary history
POST   /employees                     -> create employee (+ initial SalaryRecord, reason=HIRE)
PATCH  /employees/:id                 -> update employee core fields
POST   /employees/:id/salary          -> add a SalaryRecord (raise/adjustment), body: {amount, currency, effectiveDate, reason}

GET    /departments                   -> list, for filter dropdowns
GET    /countries                     -> list, for filter dropdowns

GET    /analytics/summary             -> headcount, total & avg payroll cost (by currency)
GET    /analytics/by-department       -> avg/median salary + headcount per department
GET    /analytics/by-country          -> avg/median salary + headcount per country
GET    /analytics/by-level            -> avg/median salary + headcount per job level
GET    /analytics/distribution        -> salary histogram buckets
```
All list/analytics endpoints are paginated or pre-aggregated server-side —
never ship all 10,000 rows to the browser to filter client-side.

## Seeding
`backend/prisma/seed.ts` using `@faker-js/faker`, deterministic (`faker.seed(n)`),
generates ~8 departments, ~10 countries, 10,000 employees with a realistic
job-level distribution (pyramid: more L1-L2 than L5-L6) and level-appropriate
salary bands per country, plus one initial `SalaryRecord` (reason=HIRE) each,
and salary-history events for a subset to make the audit trail visible.

## Non-functional
- Employee list query for 10,000 rows with filters must return in <200ms
  locally (achieved via DB-level pagination + indexes, not app-level slicing).
- All mutating endpoints validate input server-side (`class-validator` DTOs);
  the UI must never be the only validation layer.
- No secrets in the repo; SQLite file path via `.env` (`DATABASE_URL`).

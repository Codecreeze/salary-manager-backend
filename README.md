# ACME Salary Manager — Backend

NestJS + TypeScript + Prisma + SQLite API for the employee salary management
assessment. See [`docs/`](docs) for the PRD, TRD, architecture, and
engineering rules this was built against.

## Setup

```bash
npm install
cp .env.example .env
npx prisma migrate dev   # creates prisma/dev.db and runs the seed automatically
```

If you need to (re)seed without a fresh migration:

```bash
npm run db:seed
```

This generates 8 departments, 10 countries, and 10,000 employees with salary
history (deterministic — `faker.seed(42)`).

## Run

```bash
npm run start:dev   # http://localhost:3000, watches for changes
npm run build && node dist/main.js   # production-style run
```

CORS is open to `http://localhost:5173` by default (the frontend's Vite dev
server) — override with `CORS_ORIGIN` in `.env`.

## Test

```bash
npm test          # Jest unit tests (services) — 22 tests
npm run test:e2e  # Supertest HTTP contract tests — 14 tests
npm run lint       # oxlint
```

Both test suites run against an isolated `test/test.db`, never the seeded
`prisma/dev.db`.

## API

See [`docs/TRD.md`](docs/TRD.md) for the full contract. Summary:

```
GET    /employees?search=&departmentId=&countryId=&jobLevel=&status=&page=&pageSize=&sortBy=
GET    /employees/:id
POST   /employees
PATCH  /employees/:id
POST   /employees/:id/salary

GET    /departments
GET    /countries

GET    /analytics/summary
GET    /analytics/by-department
GET    /analytics/by-country
GET    /analytics/by-level
GET    /analytics/distribution
```

All analytics endpoints are segmented per currency (never blended — see
[`docs/PRD.md`](docs/PRD.md) for why).

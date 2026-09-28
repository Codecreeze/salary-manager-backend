# PRD — ACME Salary Management Software

## Goal
Replace ACME's Excel-based salary tracking with a web application that lets the
HR Manager view, manage, and analyze salary data for 10,000 employees across
multiple countries, and answer questions about how the org pays people.

## User
HR Manager (single internal role for v1). Needs fast search, easy editing,
and pay analytics without touching a spreadsheet or asking engineering for a
report.

## Scope (in)
- **Employee directory**: paginated, searchable (name/email/id), filterable
  (department, country, job level, employment status) list of all 10,000
  employees, backed by a real database (not client-side filtering of 10k rows).
- **Employee profile**: view and edit an employee's core record (name, email,
  department, country, job level, manager, employment status) and current
  compensation (base salary, currency, effective date).
- **Salary history**: every salary change is recorded with an effective date
  and reason, so a raise is an auditable event, not an overwrite.
- **Create / update employee** with server-side validation (required fields,
  salary bounds, valid currency/country).
- **Pay analytics dashboard**: headcount, total & average payroll cost;
  average/median salary by department, country, and job level; salary
  distribution (band histogram); highest/lowest paid departments — the
  concrete answers an HR Manager asks about "how we pay people."
- **Seed data**: a script generating 10,000 realistic employees with
  believable department/country/level/salary distributions, so analytics are
  meaningful out of the box.

## Scope (out) — and why
- **Auth / multi-user / roles (SSO, permissions, audit-by-user)** — the brief
  names a single persona (HR Manager). Building real auth is a distinct,
  security-sensitive problem; a login screen without a real identity
  provider behind it would be theater, not value. *Left out.*
- **Payroll execution / tax / bank integration / payslips** — the ask is
  "manage salary data and answer questions about it," not run payroll. Tax
  and disbursement rules vary per country and are a project of their own.
  *Left out.*
- **Bulk import/export (CSV upload), org chart visualization, approval
  workflows for raises** — valuable, but secondary to the core
  view/edit/analyze loop and would dilute effort on a 1-person, time-boxed
  build. *Left out of v1; noted as natural next iterations.*
- **Pay-equity / demographic analysis (gender, ethnicity pay gap)** — the
  seed data has no demographic attributes, and fabricating them to power a
  sensitive analysis would produce misleading numbers. Core pay-by-segment
  analytics (dept/country/level) are included instead. *Left out.*
- **Real-time collaboration / notifications** — single HR Manager persona,
  no concurrent-editing conflict to solve yet. *Left out.*
- **Currency conversion to a single reporting currency** — requires live FX
  rates and a rate-history model to stay correct over time; analytics report
  per-currency instead of a blended (and silently wrong) total. *Left out,
  flagged as a known limitation.*

## Success criteria
An HR Manager can, without a spreadsheet: find any of 10,000 employees in
under a second, edit their salary with a recorded reason, and answer "what's
our average salary in Engineering in Germany vs. the US?" directly from the
dashboard.

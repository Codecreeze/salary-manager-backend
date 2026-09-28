# AI Tool Usage Notes

Built with Claude Code (Anthropic), used as an agentic pair-programmer, not
as an autocomplete. Workflow:

1. **Requirements & design were written by directing the model, not
   accepting a first draft.** The assignment brief was pasted in full;
   the model was pushed to produce a one-page PRD with an explicit
   "what we're leaving out and why" section (not just a feature list),
   then a TRD with a concrete Prisma schema and REST contract, then an
   architecture doc with a trade-off table — each reviewed before moving on.
2. **Stack decisions were made by the author via targeted questions**
   (backend framework/DB, analytics scope, git handling), not left to the
   model's default choice — see chat history for the actual prompts.
3. **Implementation was delegated to specialized subagents** (backend
   architect/test-engineer, frontend architect/test-engineer, design/QA
   review) each briefed with the PRD/TRD/ARCHITECTURE/RULES docs above as
   their spec, so independent agents build against the same contract instead
   of inventing their own.
4. **Every module was reviewed against `RULES.md`** (no inline styles, no
   Prisma calls outside services, controller/service separation, DRY on
   "current salary" logic) rather than accepted as-is.
5. **Tests were required, not optional** — each implementation subagent was
   instructed to write and run its own tests before reporting done; a
   findings/verification pass followed.

6. **Integration was verified by actually running both services together,
   not by trusting each subagent's isolated report.** The backend and
   frontend subagents each validated their own build/lint/tests
   independently and both reported success — but they were built against
   the same *written* contract (TRD.md) without ever talking to each other.
   Running both live and clicking through the real UI surfaced three bugs
   neither subagent's own tests caught, because each side's tests only
   checked internal consistency with its own assumptions:
   - **Pagination envelope mismatch**: backend returned
     `{ data, meta: { total, page, pageSize, pageCount } }`; frontend types
     assumed `{ items, total, page, pageSize }`. Fixed with an explicit
     `transformResponse` at the RTK Query boundary (frontend), keeping the
     backend's contract as source of truth since it had passing tests.
   - **Analytics shape mismatch**: backend segments every analytics endpoint
     by currency (`by-department`/`by-country`/`by-level` return one row per
     group *per currency*; `distribution` returns `{currency, buckets}[]`)
     to avoid blending currencies (see PRD); the frontend's types assumed a
     flat, single-currency shape. Fixed with `transformResponse` mappings
     plus a currency selector in the dashboard UI, rather than changing the
     backend to blend currencies incorrectly.
   - **Real data exposed a bucketing bug**: the distribution chart's fixed
     20,000-unit bucket width produced ~500 buckets for JPY (whose salary
     figures run into the millions) and rendered an unusably tall chart.
     Fixed by deriving bucket width per currency from that currency's own
     min/max range (targeting ~12 "nice" buckets), a bug that was invisible
     in unit tests using small hand-picked fixtures and only showed up
     against the real 10,000-row seed.
   None of these would have been caught without running the real stack
   end-to-end in a browser — a deliberate lesson applied here: agent reports
   describe intent and isolated validation, not integration correctness.

No AI-generated code was committed without being read. Git commits and
pushes were performed by the human author, not the AI, per the assignment
instructions.

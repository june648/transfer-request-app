# CLAUDE.md

Guidance for Claude Code when working in this repository. See README.md for the feature overview and project structure.

## Deployment (important)

- **Production:** https://transfer-request-app-three.vercel.app
- **Deploys automatically when `master` is pushed** to github.com/june648/transfer-request-app (Vercel Git integration, connected 2026-08-13). Before that date the app was deployed manually via Vercel CLI — do not assume old commits ever went live.
- The user works in the **deployed app**, not localhost. A fix is not done until it is committed, pushed, and verified live.
- To verify a deploy landed: fetch the live page, pull its `/_next/static/*.js` chunk URLs, and grep the chunks for a string unique to your change. Vercel also reports build status on the GitHub commit (`/commits/<sha>/status`).
- Git identity is configured repo-local only (global git config has no identity). Vercel CLI on this machine is logged out; use the Git-push deploy path.

## Development

- `npm run dev` — dev server on **port 3700** (not 3000).
- `npm run build` — production build with type checking; run this to validate changes.
- No test suite exists.

## Architecture notes

- **No backend of its own.** The browser calls the Airtable REST API directly from `src/lib/airtable.ts`, authenticated by a Personal Access Token stored in `localStorage` (configured via the in-app Settings modal, per browser).
- Two tables in the user-configured base, auto-created if missing: `Transfer_Requests` and `Transfer_Line_Items` (linked by the `TransferRequest_ID` string, not Airtable record links). Table IDs are cached in `localStorage`.
- Product catalog search reads a separate hard-coded base/table (`PRODUCTS_BASE_ID` / `PRODUCTS_TABLE_ID` in `airtable.ts`).
- **All Airtable calls must go through `airtableFetch`/`metaFetch`**, which wrap `fetchWithRetry`: up to 3 retries with exponential backoff on network failures, 429 rate limits (longer backoff — Airtable enforces a cooldown), and 5xx errors. Added 2026-08-13 to fix intermittent "Failed to fetch" save errors.
- **Batch record operations 10 per request** (Airtable's max) instead of one request per record — see `createLineItems`, `updateLineItems`, `deleteLineItems`. Airtable's limit is 5 requests/sec per base; per-record loops were the root cause of the save failures.

## Conventions

- Transfer request IDs are plain `TR-YYYYMMDD`. Only on a same-day collision does a suffix appear (`TR-YYYYMMDD-002`, `-003`, …). The user explicitly asked for no suffix on the first request of the day — do not reintroduce it.
- Status workflow: Draft → Submitted → In Transit → Received → Cancelled.
- User-facing errors surface via `alert()`; keep messages plain-language (the users are warehouse/operations staff, not developers).

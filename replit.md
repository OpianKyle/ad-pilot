# AdPilot Business

AdPilot Business is a web workspace for business owners to create and organize social campaign drafts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/adpilot-business run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required shared environment values: `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`, and the `MYSQL_PASSWORD` secret
- Optional environment values: `MYSQL_PORT` (defaults to `3306`), `MYSQL_SSL` (TLS is on by default; set to `false` only if the database cannot use TLS)
- Import the supplied MySQL schema for `businesses`, `users`, and `campaigns` before using the app. The API creates its `adpilot_sessions` table on first use.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React + Vite
- API: Express 5, shared under `/api`
- App data: MySQL via `mysql2`
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from the OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/adpilot-business/` — the React web app
- `artifacts/api-server/src/routes/` — account and campaign API routes
- `artifacts/api-server/src/lib/mysql.ts` — MySQL connection and session handling
- `lib/api-spec/openapi.yaml` — source of truth for API contracts
- `attached_assets/schema_1795513164036.sql` — original business, user, and campaign table schema

## Architecture decisions

- Browser requests use same-origin, HTTP-only cookies; mutations also require a CSRF header.
- Session IDs are random, stored hashed in MySQL, and rotated after sign-in or registration.
- Existing PHP bcrypt passwords are accepted during sign-in; new passwords use bcrypt.

## Product

- Account registration and sign-in for a business owner
- Campaign overview, campaign search, and draft creation
- No social publishing, AI generation, billing, or platform integrations are included yet.

## User preferences

- The signed-in workspace must use the same grouped sidebar and section links as `/preview`; keep sections in the main workspace instead of adding a separate sections page.

## Gotchas

- The API expects the existing MySQL tables to be present. It adds `adpilot_sessions` automatically and therefore needs permission to create that table.
- `MYSQL_SSL` defaults to TLS enabled; only disable it when the database provider does not support TLS.
- Keep MySQL credentials in Replit Secrets/environment settings, never in source files or chat.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

# Mini Order Management CRM

Mini Order Management CRM is a developer interview assignment for managing Shopify store orders from a small CRM. It includes a React operator interface and a NestJS API backed by PostgreSQL and Prisma, using Shopify Admin GraphQL API `2026-10`.

Implemented functionality includes order import and incremental synchronization, order search and status/date filters, order details, Shopify product and customer lookup, optional authenticated order creation, and webhook-driven order updates. A single operator account protects browser access to customer data and order creation.

## Requirements

- Node.js 22.12 or newer on the 22.x line (or a compatible current LTS release)
- npm 10 or newer
- PostgreSQL installed and running locally, or Docker Compose for a local PostgreSQL service
- A Shopify development store and app in the same organization for the client-credentials flow (optional for local work that does not use Shopify)
- Shopify app permissions described in [Shopify integration](#shopify-integration) for the features you use

## First-time setup

Install dependencies and run the setup wizard from the repository root. The active `.env` belongs in the repository root, not inside `backend/`.

Windows Command Prompt example (change the path to match your clone location):

```cmd
npm ci --prefix backend
npm ci --prefix frontend
npm run setup
```

PowerShell alternative:

```powershell
npm ci --prefix backend
npm ci --prefix frontend
npm run setup
```

The wizard creates `.env` from `.env.example` only when it is missing. It keeps existing values, asks before changing configured operator credentials or rotating a session secret, and stores only the generated password hash. Passwords and database URLs are entered without terminal echo. It checks PostgreSQL, generates Prisma Client, offers to deploy existing migrations, and checks a configured Shopify app with a read-only shop query. It never installs PostgreSQL, creates database accounts, resets databases, or creates Shopify orders. Rerunning setup is safe and does not rotate valid credentials unless you choose to. Never commit `.env` or share its contents.

You can use a local PostgreSQL installation or start the optional Docker Compose database from the repository root:

```powershell
docker compose up -d postgres
```

For Shopify functionality, configure the store domain, app client ID and secret, and API version `2026-10`. The app uses Shopify's client-credentials flow, intended for an app and store in the same Shopify organization. Grant `read_orders` and `read_customers` for order and customer details, and complete any required protected customer data review. Access to older history also requires Shopify's approval for `read_all_orders`; without it, initial import covers the latest 60 days. `SHOPIFY_SYNC_SECRET` is required for manual sync; `SHOPIFY_ORDER_CREATE_SECRET` is optional for trusted backend-only order creation.

The setup wizard configures the single operator account and the manual sync secret. `SHOPIFY_ORDER_CREATE_SECRET` is optional for trusted backend-only bearer access; browser requests use the operator session instead.

After setup, start the backend (Terminal 1):

```powershell
Set-Location backend
npm run start:dev
```

Start the frontend (Terminal 2):

```powershell
Set-Location frontend
npm run dev
```

Open the frontend at <http://localhost:5173>. The API health endpoint is <http://localhost:3000/api/health>. The Vite development server proxies `/api` requests to `http://localhost:3000`; if you change `API_PORT`, update the Vite proxy target as well.

## Useful commands

Run from `frontend/`:

```powershell
npm run build       # TypeScript project build and Vite production build
npm run lint        # ESLint
npm run typecheck   # TypeScript verification
```

Run from `backend/`:

```powershell
npm run build       # NestJS production build
npm run lint        # ESLint
npm run typecheck   # TypeScript verification
npm run prisma:validate
npm run prisma:status   # Read-only migration status
npm run prisma:check    # Safe SELECT 1 connectivity check
npm run prisma:migrate -- --name describe_schema_change
```

`prisma:migrate` and `prisma:deploy` can change the database schema. Review migration status and schema changes before running either command. Neither is needed just to check connectivity.

`docker-compose.yml` is an optional local PostgreSQL alternative; the project does not require Docker. If you choose that option, its database credentials come from the Compose environment variables and should be kept local.

## Database setup

With PostgreSQL running and the root `.env` configured, run these commands from `backend/`:

```powershell
npm run prisma:validate
npm run prisma:status
npm run prisma:deploy
npm run prisma:generate
npm run prisma:check
```

`prisma:deploy` applies pending checked-in migrations without resetting existing data. Review `prisma:status` first when using an existing database. Do not use `prisma migrate reset` as a setup step; it deletes database data.

## Supported functionality

- Operator login, session restoration, CSRF protection for authenticated mutations, and logout.
- Shopify order listing, search, financial and fulfillment filters, date filtering, sorting, pagination, and order details.
- Shopify product and customer lookup for the Create Order workflow.
- Optional authenticated Shopify order creation with an idempotency key and local persistence after Shopify confirms the canonical order.
- Initial and incremental order import through the protected backend sync endpoint.
- Automatic ingestion of Shopify `orders/create` and `orders/updated` webhooks.
- Store status, order-sync metadata, and database health reporting.

The app supports one configured operator account. Shopify webhooks and manual sync use their own independent authentication and do not depend on the operator's browser session.

## Environment variables

| Variable | Purpose | Example |
| --- | --- | --- |
| `POSTGRES_DB` | Optional Docker Compose database name | `mini_order_crm` |
| `POSTGRES_USER` | Optional Docker Compose database user | `mini_order_crm` |
| `POSTGRES_PASSWORD` | Optional Docker Compose database password; choose a local value | Replace the placeholder |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma and NestJS | `postgresql://<user>:<password>@localhost:5432/mini_order_crm?schema=public` |
| `FRONTEND_ORIGIN` | Comma-separated browser origins allowed by API CORS | `http://localhost:5173` |
| `API_PORT` | NestJS listen port | `3000` |
| `SHOPIFY_SHOP_DOMAIN` | Shopify development store domain | `your-shop.myshopify.com` |
| `SHOPIFY_CLIENT_ID` | Shopify app client ID | Configure locally |
| `SHOPIFY_CLIENT_SECRET` | Shopify app client secret | Configure locally; keep private |
| `SHOPIFY_API_VERSION` | Shopify Admin GraphQL API version | `2026-10` |
| `SHOPIFY_SYNC_SECRET` | Server-only bearer secret for manual sync; at least 32 characters | Generate a unique random value |
| `SHOPIFY_ORDER_CREATE_SECRET` | Optional server-only bearer credential for trusted internal order creation | Generate a unique random value if needed |
| `CRM_OPERATOR_USERNAME` | The one permitted operator username | `operator` |
| `CRM_OPERATOR_PASSWORD_HASH` | scrypt hash of the operator password; never put a plaintext password here | Generated locally |
| `CRM_SESSION_SECRET` | Independent random server-only key (at least 32 characters) used to sign session and rate-limit hashes | Generated locally |
| `CRM_SESSION_TTL_MINUTES` | Fixed session lifetime from 5 to 1440 minutes; defaults to 480 | `480` |

`SHOPIFY_SYNC_SECRET` and `SHOPIFY_ORDER_CREATE_SECRET` must each be unique and at least 32 characters when used. The operator login settings, Shopify client secret, and authorization secrets are server-only. Shopify credentials, password hashes, and session secrets are never returned by API status routes.

Keep `.env` local and out of version control. `.env.example` contains placeholders only.

## Project structure

```text
mini-order-crm/
+-- backend/
|   +-- prisma/                  # Schema and versioned SQL migrations
|   +-- src/auth/                # Single-operator session and CSRF protection
|   +-- src/health/              # Database-backed health endpoint
|   +-- src/orders/              # Order APIs, persistence, and idempotent creation
|   +-- src/shopify/             # Admin API client, catalog lookup, sync, and importer
|   +-- src/webhooks/             # HMAC-verified, queued Shopify order webhooks
|   +-- test/                    # Backend automated regression tests
|   +-- scripts/                 # Safe setup, password-hash, and webhook tools
+-- frontend/                    # React, Vite, TypeScript CRM pages and components
+-- docker-compose.yml           # Optional PostgreSQL alternative
+-- .env.example
+-- .gitignore
+-- README.md
```
## Health response

`GET /api/health` runs a lightweight query against PostgreSQL. It returns HTTP 200 with `{ "status": "ok", "database": "connected" }` when the database is reachable and HTTP 503 when it is unavailable.

## Read-only APIs

- `GET /api/orders` lists orders with `page` (default `1`), `pageSize` (default `20`, maximum `100`), `search`, `financialStatus`, `fulfillmentStatus`, `dateFrom`, `dateTo`, and `sort` (`newest` or `oldest`). Date-only range values include the entire `dateTo` day; timestamp values must include a timezone.
- `GET /api/orders/:id` returns one order with customer and line item details. IDs must be UUID v4 values.
- `GET /api/shops/status` returns configured shop connection metadata without credentials.
- `GET /api/shopify/products?search=keyboard&first=50&after=<cursor>` searches Shopify product variants. Results include Shopify product and variant IDs, product and variant names, SKU, Shopify price, shop currency, options, availability, and pagination cursors. `search` is optional; `first` must be between 1 and 100.
- `GET /api/shopify/customers?search=jane&first=25&after=<cursor>` searches existing Shopify customers and requires an operator session (or the optional backend bearer credential) because results can contain customer email addresses.

List responses use `{ "data": [], "meta": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 } }`. Detail responses use `{ "data": { ... } }`. API errors use `{ "error": { "code": "...", "message": "..." } }`; the existing health failure response is preserved.

## Shopify integration and order synchronization

`GET /api/shopify/status` returns safe configuration, the Shopify-provided store display name when available, and last-sync metadata. `POST /api/shopify/sync` performs the initial or next incremental order import and requires `Authorization: Bearer <SHOPIFY_SYNC_SECRET>`. It returns inserted, updated, and unchanged counts plus the available history coverage. The first sync covers all accessible history when Shopify grants `read_all_orders`; otherwise it covers the latest 60 days. Later syncs use the stored sync timestamp with an overlap window.

The integration uses Shopify Admin GraphQL API `2026-10`, the client-credentials flow, and an app/store in the same Shopify organization. Grant `read_orders` and `read_customers` for order import and customer details; `read_products` is needed for product lookup; `write_orders` is needed for order creation; and webhook registration requires permission to manage webhook subscriptions (including `write_webhooks` where required). Shopify may require protected customer data approval for customer information. Access to older orders requires `read_all_orders` approval.

Orders and items are upserted transactionally; the importer skips an older Shopify version of an order and retries serializable transaction conflicts. Sync status advances only after every fetched order has been imported successfully. `lastSyncedAt` describes the last successful manual or incremental sync. Webhook processing and CRM-created orders can update order records without advancing this timestamp, so it is not a guarantee that every order is current.

## Shopify order creation (Phase 5A)

### Operator login

The backend supports one operator configured by `CRM_OPERATOR_USERNAME` and `CRM_OPERATOR_PASSWORD_HASH`. Run `npm run setup` from the repository root to choose or change the username and password. Password input is hidden and only the compatible scrypt hash is stored. Existing credentials can be kept without knowing the current password. A password change takes effect on the next login. Rerun setup and explicitly choose session-secret rotation to invalidate existing sessions; the wizard creates a separate 32-byte random secret when none is valid. Optionally set `CRM_SESSION_TTL_MINUTES` from 5 to 1440; the default is 480 minutes.

To update Shopify settings later, rerun `npm run setup` and choose to change the relevant values, or edit the ignored root `.env` directly. Required integration settings are `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_CLIENT_ID`, `SHOPIFY_CLIENT_SECRET`, `SHOPIFY_API_VERSION`, and a unique 32+ character `SHOPIFY_SYNC_SECRET`. `SHOPIFY_ORDER_CREATE_SECRET` is optional and only for trusted backend tools. Local development URLs are `http://localhost:5173` for Vite and `http://localhost:3000` for NestJS; they are not Shopify credentials.

For database troubleshooting, confirm PostgreSQL is running and the root `.env` `DATABASE_URL` points to a reachable database. Setup uses a safe `SELECT 1` check before offering `prisma migrate deploy`; it never resets a database. If Prisma reports `EPERM` on Windows, stop backend Node processes and rerun setup so Prisma can generate its engine files. Do not delete files locked by a running process. If Shopify is unavailable, local setup can still finish and the report will say Shopify needs attention.

| Endpoint | Request | Success |
| --- | --- | --- |
| `POST /api/auth/login` | `{"username":"operator","password":"..."}` | `200 {"authenticated":true,"username":"operator","csrfToken":"...","expiresAt":"..."}` and an HttpOnly session cookie |
| `GET /api/auth/session` | No body | `200 {"authenticated":true,"username":"operator","csrfToken":"...","expiresAt":"..."}` or `200 {"authenticated":false}` |
| `POST /api/auth/logout` | `X-CSRF-Token: <csrfToken>` | `200 {"authenticated":false}` and an expired session cookie |

The browser must call the relative `/api/...` routes through Vite's existing proxy, with `credentials: 'include'` on login, session, logout, customer lookup, order creation, and creation-request status calls. The proxy forwards `Cookie` and `Set-Cookie` headers without extra configuration. On successful login or session lookup, keep `csrfToken` in memory and send it as `X-CSRF-Token` for `POST /api/auth/logout` and cookie-authenticated `POST /api/orders`. Refresh the in-memory token from `GET /api/auth/session` after a page reload. Never store the session cookie or a reusable bearer credential in JavaScript storage.

Login and cookie-authenticated mutations require an `Origin` matching one of the exact origins in `FRONTEND_ORIGIN`. The API enables credentialed CORS only for those origins. The session cookie is HttpOnly, host-only, scoped to `/api`, SameSite=Lax, and Secure for HTTPS/production requests. Sessions expire after the configured fixed lifetime and are stored server-side. Five failed logins from one source IP in a 15-minute window trigger a 15-minute block; the IP is stored only as a keyed hash. Logout revokes the database session and clears the cookie. Keep the frontend and API same-site; the Vite proxy presents the API as same-origin in local development.

`POST /api/orders` creates an order in Shopify first, fetches the canonical Shopify order, then uses the existing transactional importer to save it locally. The database is never used to create an order before Shopify confirms it. A concurrent `orders/create` webhook and this request share the importer's unique Shopify order and line-item keys, so they update the same rows.

Browser order creation, customer lookup, and creation-request status require the authenticated session. Cookie-authenticated order creation additionally requires a valid `X-CSRF-Token` and allowed `Origin`; missing/expired sessions return HTTP 401 and CSRF failures return HTTP 403. Trusted backend tools can continue to use `Authorization: Bearer <SHOPIFY_ORDER_CREATE_SECRET>` when that optional secret is configured. Never put that bearer secret or Shopify credentials in React source, browser storage, or Vite environment variables. Product lookup does not return customer data.

The request requires an explicit `Idempotency-Key` header (16–128 letters, digits, `.`, `_`, `:`, or `-`). Reuse the same key for retries of the same normalized request. Reusing it with changed input returns `409 IDEMPOTENCY_KEY_REUSED`. Completed requests return the original CRM order. A confirmed Shopify rejection is retained against that key; after correcting the request, use a new key. When a network or server failure leaves Shopify's result uncertain, the key is marked `uncertain`; the API will not send another `orderCreate` mutation for that key. Check `GET /api/orders/creation-requests/:key` with operator authorization and reconcile in Shopify before deciding whether to start a new request. If Shopify confirms creation but local import fails, the key becomes `sync_pending`; retrying the same request resumes the canonical fetch/import without creating a second order.

Request body:

```json
{
  "customerId": "gid://shopify/Customer/123",
  "items": [
    { "variantId": "gid://shopify/ProductVariant/456", "quantity": 2 }
  ],
  "note": "Optional order note"
}
```

`customerId` and `note` are optional. `items` must contain 1–100 distinct Shopify variant IDs; each quantity must be an integer from 1 to 1000. The backend verifies each variant is active and available and verifies any selected customer still exists. Client prices and currency fields are rejected. Shopify determines prices, currency, totals, and order state. A successful response is `{ "data": <canonical CRM order including line items> }`; validation and Shopify errors use the standard `{ "error": { "code": "...", "message": "..." } }` format. The response may be `503 ORDER_CREATION_OUTCOME_UNKNOWN` after an uncertain network result or `503 ORDER_CREATED_SYNC_PENDING` when Shopify accepted the order but the local import needs another attempt.

The backend sends `orderCreate` once per idempotency key and does not automatically retry that mutation. Product/customer queries use the existing Admin API client's pagination, throttling, and permission handling. For trial or development stores, Shopify limits `orderCreate` to five new orders per minute. The backend also handles GraphQL `THROTTLED` and HTTP `429` responses without retrying the creation mutation.

The order-creation workflow uses Shopify's `orderCreate` mutation and requires `write_orders` plus the supported offline client-credentials authentication. Permissions and protected-data approval are controlled by the Shopify app installation and must be checked in the target development store.

The order request ledger requires the migration `20261024180000_shopify_order_creation_requests`. Stop a running NestJS process first because Windows can keep Prisma's query-engine file locked. Generate Prisma Client and deploy reviewed migrations before starting the backend again:

```powershell
Set-Location backend
npm run prisma:generate
npm run prisma:validate
npm run prisma:deploy
npm run start:dev
```

For Antigravity integration, call `POST /api/auth/login` with `{ username, password }`, then use `GET /api/auth/session` to restore login state after reload. Include `credentials: 'include'` on all API calls. Keep the returned CSRF token in memory and send `X-CSRF-Token` on logout and `POST /api/orders`. Call `/api/shopify/products` and `/api/shopify/customers` through `/api`; build line items from returned Shopify GIDs and submit only IDs plus quantities. Generate one `Idempotency-Key` per deliberate submission and preserve it for retries. Call `POST /api/auth/logout` with the CSRF header when the operator signs out.

## Shopify order webhooks

`POST /api/webhooks/shopify` accepts Shopify `orders/create` and `orders/updated` deliveries. The backend checks the raw-body HMAC with `SHOPIFY_CLIENT_SECRET`, validates the shop and topic, and durably records the delivery before responding. A small database-backed worker fetches the canonical order through the Admin GraphQL API, then saves it through the same transactional importer used by manual sync. Delivery IDs are unique per shop; duplicates are acknowledged, failed jobs retry with backoff, and exhausted deliveries can be requeued by Shopify retrying the delivery. `SHOPIFY_SYNC_SECRET` is only for the internal manual-sync endpoint.

For local delivery testing, start NestJS on port 3000 and expose it with a temporary HTTPS tunnel, for example `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`. Keep the tunnel running while Shopify sends deliveries. Register both topics against the tunnel's public URL (the script refuses localhost, non-HTTPS, or a different path):

```powershell
Set-Location backend
npm run webhooks:register -- https://YOUR-TUNNEL-HOST/api/webhooks/shopify
```

The registration script uses the existing client-credentials configuration in root `.env` and Shopify Admin GraphQL API `2026-10`; it skips topics already registered to the same callback. Confirm the app has permission to manage webhook subscriptions (including `write_webhooks` where required) and is installed on the configured shop. Re-run the command after the tunnel URL changes. Never register a placeholder or non-public URL. Registration confirms Shopify configuration only; live delivery is verified only after an actual Shopify delivery reaches the endpoint successfully. Automated webhook tests use mocked Shopify and database dependencies.

## Automated tests and quality checks

Run the backend regression suite and checks from `backend/`:

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run prisma:validate
npm run prisma:status
```

`npm test` builds the backend and runs the maintained auth, order, Shopify, webhook, and shop-status tests. `prisma:status` is a read-only migration check and requires a reachable database.

Run frontend checks from `frontend/`:

```powershell
npm run typecheck
npm run lint
npm run build
```

Dependency advisories can be checked with `npm audit` from each package directory. Do not use `npm audit fix --force` as a routine setup step; review compatibility and lockfile changes first.

## Phase boundaries

This backend provides a single-operator browser session for customer lookup and order creation. Shopify webhooks continue to use their independent raw-body HMAC verification and do not require operator login. Manual synchronization remains protected by its separate backend-only bearer secret.

## Limitations

- There is one operator username and password hash; multi-user accounts, roles, and account recovery are not implemented.
- The Vite development proxy targets `http://localhost:3000`. Keep `API_PORT=3000` unless you also update that proxy configuration.
- Initial import history is limited to 60 days unless Shopify grants `read_all_orders`.
- `lastSyncedAt` advances after a successful sync request, not after each webhook or CRM order creation. It should not be presented as a real-time or complete freshness guarantee.
- Synchronization can be run through the protected manual endpoint and orders can arrive through Shopify webhooks; there is no periodic scheduler in this repository.
- Local webhook delivery requires a public HTTPS tunnel. Temporary tunnel hostnames can change, requiring webhook registration to be updated.
- A successful webhook registration does not prove live event delivery. Shopify must send a delivery to the public callback.
- Shopify development stores limit `orderCreate` throughput (currently five new orders per minute); Shopify may change store-level limits.
- The app depends on Shopify permissions, app installation state, and protected customer data approval for the corresponding functionality.

## Demonstration videos

- Application walkthrough: **Link not provided**
- Code walkthrough: **Link not provided**

# Application architecture

Qinghe has two deployment targets that share the market information, visual components and translations.

```mermaid
flowchart LR
  Visitor[Public visitors] --> Pages[GitHub Pages / public-site.html]
  Pages --> Guide[Versioned market schedules and price archive]
  Customer[Customers / vendors / school staff] --> App[React application / index.html]
  App --> HTTP[Same-origin Express API]
  HTTP --> Auth[Session and role checks]
  Auth --> Services[Orders / operations / SNAP / workflows / reports]
  Services --> DB[(SQLite on persistent disk)]
  DB --> Backup[Verified online backups]
```

## Frontend boundaries

- `src/public-site/` is a standalone public entry. It can operate entirely on GitHub Pages, without an API or account. It offers verified dates, location navigation, historical price references and help resources. It does not accept orders or collect account information.
- `src/App.tsx` composes the full application shell, authentication, shopping and role navigation. Price charts and school modules load on demand. `src/Prices.tsx` owns price analysis, and `src/Stat.tsx` is shared presentation.
- `src/PageBoundary.tsx` handles loading and module failures with a user-visible recovery action.
- `src/navigation.tsx` centralizes routes and handles a repository subpath through Vite's `BASE_URL`. Public builds emit a document for each available route, so refreshes and new tabs work on Pages.
- `src/MarketVisit.tsx`, `src/MarketGuide.tsx`, `src/marketSchedule.ts` and `references/` own the public market guide. Backend session lookups are explicitly disabled in the public entry.
- `src/api.ts` is the only general API transport. Components do not access the database or receive credentials from build-time environment variables.

## Backend boundaries

- `server/index.mjs` owns process startup, shutdown and the database connection. It drains HTTP requests before closing SQLite.
- `server/config.mjs` validates environment variables and rejects invalid settings before listening. Production requires an explicit database path and defaults to no demo data with secure cookies.
- `server/http-policy.mjs` owns security headers, proxy configuration and browser write-origin checks. `PUBLIC_ORIGIN` allows exact matching behind an HTTPS reverse proxy.
- `server/app.mjs` composes HTTP routes, validation, sessions and role checks.
- `server/services.mjs` owns server pricing, transactional inventory and order state transitions; `operations.mjs` owns sessions, pickup and receipts. `snap.mjs` owns food eligibility and mixed tender estimates.
- `admin.mjs`, `analytics.mjs` and `screen.mjs` compose school reporting. `workflows.mjs` covers vendor applications and market operations. Email notifications use a durable outbox and a separately configured provider.
- `server/db.mjs` creates and migrates SQLite, using foreign keys, WAL and busy timeouts. Migrations must preserve existing orders and price snapshots.

## Deployment and data

The full app is a **single Node.js 24 process with one writable persistent disk**. React assets and the API share an origin. A container's writable layer is not durable storage; `/data` must be a volume. Run one replica while using SQLite; scaling to multiple application replicas requires a coordinated database migration rather than shared container-local files.

Hashed assets receive a year of immutable caching. HTML, account data and API responses use `no-store`. No database, real contact book, `.env`, backup or test artifact belongs in the public repository or Pages artifact.

The public Pages artifact contains only the public site and versioned reference data. Backend configuration, the database and the authenticated application are not deployed there. Its reference information changes through reviewed source updates; it is not a live closure or inventory feed.

## Verification

`npm run check` type-checks and builds the full application, builds the independent public website and runs the Node regression suite. Browser tests verify role workflows and responsive layouts. Deployment tests exercise exact origin checks behind a proxy, invalid configuration, deep links, cache headers and a WAL-safe database backup. GitHub Actions also builds and starts the Docker image using a named data volume.

CI validates source; publishing the public guide and deploying the full backend are distinct jobs. A successful Pages deployment does not imply that online ordering is available.

# Publishing and operating Qinghe

## Interactive demo (GitHub Pages)

The interactive public demo is built from `public-site.html`, with a separate browser runtime for the shared application:

```sh
npm ci
npm run build:public
npm run preview:public
```

The default URL prefix is `/qinghe-market-guide/`. To use a custom domain or another prefix, set `PUBLIC_BASE_PATH` when building and rebuild. `dist-public/` is the complete Pages artifact, including SQLite WebAssembly. Serve `.wasm` assets as `application/wasm` (GitHub Pages does this automatically).

The public build uses the complete original interface and business routes. It starts as a sample customer without login; the toolbar switches to vendor and university roles. Direct `/admin/…` and `/retailer/…` links choose the corresponding sample role. Products, orders, fulfillment, assisted operations, market settings and statistics use a separate in-browser SQLite database for each tab. Refresh restores it from `sessionStorage`; Reset clears only that tab. With blocked browser storage, the page remains usable until refresh and displays a storage notice.

These actions affect sample data only. The public runtime neither accepts credentials nor sends real orders, payments or email. The Node build remains authenticated and is not deployed publicly. No Railway login is required for this demo.

Live interactive demo: https://lucasyanzy.github.io/qinghe-market-guide/

Source code and the website are maintained together in the public repository [LucasYanzy/qinghe-market-guide](https://github.com/LucasYanzy/qinghe-market-guide). Both the original application history and the earlier static website commits are retained. See [repository-migration.md](repository-migration.md).

GitHub Pages uses **GitHub Actions** as its publishing source. `.github/workflows/pages.yml` runs on `main` and on manual dispatch. It installs the locked dependencies on Node 24, builds and checks the application, tests the public demo, uploads `dist-public/` with `actions/upload-pages-artifact`, and publishes it with `actions/deploy-pages`. The `github-pages` environment records the deployed URL. The workflow uses the repository's built-in `GITHUB_TOKEN` with `contents: read`, `pages: write`, and `id-token: write`; no personal token or cross-repository copy is required.

To publish an update, open a pull request against `main`, review the validation checks, and merge it. Do not commit `dist/` or `dist-public/`. Find the live URL in the repository's **About → Website**, this README, or **Settings → Pages**. The old private repository retains historical PR records; new development belongs here.

## Full application (Node.js / Railway / Docker)

Use Node.js **24**. For a public demo, explicitly set `DEMO_MODE=true` and use a dedicated disposable database; demo credentials are public. For real operations use `DEMO_MODE=false` with a new database and initialize the school administrator interactively.

Required hosting configuration:

| Setting | HTTPS deployment |
| --- | --- |
| Build | Dockerfile (or `npm ci && npm run build`) |
| Start | `node server/index.mjs` inside the image, otherwise `npm start` |
| Node | 24 |
| `NODE_ENV` | `production` |
| `DATABASE_PATH` | `/data/market.sqlite` on a persistent volume |
| `DEMO_MODE` | `true` for a public demo; `false` for real operations |
| `COOKIE_SECURE` | `true` |
| `PUBLIC_ORIGIN` | exact public HTTPS origin, e.g. `https://market.example.com` |
| `TRUST_PROXY` | actual proxy-hop count, normally `1` on Railway; `0` for direct HTTP |
| Health check | `/api/health` |
| Replicas | `1` |

`railway.json` defines the Docker build, health check and bounded restart policy. It does not create an account, subscribe to a plan or provision a paid volume. In the chosen Railway service, mount a volume at `/data`, check the current price before activating paid resources, configure the variables above and generate its HTTPS domain. The volume must be writable by UID 1000 (`node`). Do not send real `.env`, database or backup files in deployment uploads.

For local container validation:

```sh
docker compose up --build
```

This binds to `127.0.0.1:3001` and uses a named volume. Local compose explicitly disables secure cookies for HTTP and enables demo mode. Hosted HTTPS settings must override those local values. The Docker image defaults to non-demo data and secure cookies. Stop the container with `docker compose down`; do not remove the named volume unless the data is no longer needed.

For a local production-build demo without Docker:

```sh
npm ci
npm run build
DATABASE_PATH=./data/public-demo.sqlite DEMO_MODE=true COOKIE_SECURE=false npm start
```

For a fresh operational database:

```sh
DATABASE_PATH=./data/operational.sqlite npm run setup:admin
HOST=127.0.0.1 DATABASE_PATH=./data/operational.sqlite DEMO_MODE=false COOKIE_SECURE=false npm start
```

Use the latter HTTP command only locally; configure secure cookies and `PUBLIC_ORIGIN` for public HTTPS. Startup rejects a non-demo deployment pointing to an existing database with public demo accounts. Turning the flag off does not convert demo data into operational data.

## Backup, restore and rollback

Create a consistent backup while the server is running:

```sh
DATABASE_PATH=/data/market.sqlite npm run backup -- /backups/market-2026-10-30.sqlite
```

The script uses SQLite's online backup API, includes committed WAL transactions, refuses an existing destination and checks database integrity and foreign keys. Keep backups in a separate durable location and restrict access, because operational backups contain account and order data. Use the hosting provider's scheduler for the required retention and backup frequency.

To restore, stop the application, preserve its current database and WAL files, then copy the verified backup to a **new** database path on the volume. Start a single instance with `DATABASE_PATH` set to that restored file. Check `/api/health`, administrator login, market configuration, sample historical orders and inventory before sending traffic to it. Never overwrite an open database with a filesystem copy.

To roll back code, redeploy the previous commit or image. Back up before schema changes. A code rollback may require restoring a matching database backup if the older version is incompatible with the new schema; it must not silently discard newer orders.

## What publication does not activate

The project records in-person pickup and payment intentions. It does not process card payments or online EBT. Outbound email requires its own provider configuration and an explicit outbox command. Qinghe is an independent community project, not an official Rutgers service; official announcements remain the authority for temporary closures.


## Hardened production deployment (Traefik)

Use the standalone `compose.production.yaml` for a single Linux host with Docker Compose. Do **not** combine it with `compose.yaml`: that file is a local HTTP demo with public sample accounts. Railway already supplies an HTTPS edge; use the hosting settings above there rather than running a second public proxy.

The production stack uses [Traefik](https://github.com/traefik/traefik) 3.7.17 for automatic TLS certificate issuance, renewal and HTTP-to-HTTPS redirects. Only Traefik publishes host ports (80/443). The Node service has no published port and lives on an internal network; this is required for its single-hop `TRUST_PROXY=1` setting. Traefik does not trust incoming forwarded headers by default. Do not add another proxy/CDN without reviewing that trust boundary. The Traefik dashboard/API is disabled and access logging is not enabled, avoiding request URLs or account data in access logs.

Point a real hostname at the host, allow inbound TCP 80/443 and allow Traefik outbound access for ACME certificate renewal. Replace `market.example.com` below with that hostname. Use the same Compose project name for all commands so the database volume is shared:

```sh
export MARKET_DOMAIN=market.example.com
docker compose -p rutgers-production -f compose.production.yaml config --quiet
docker compose -p rutgers-production -f compose.production.yaml build --pull
# Fresh database only; hidden password entry creates the first administrator.
docker compose -p rutgers-production -f compose.production.yaml run --rm --no-deps market node scripts/setup-admin.mjs
docker compose -p rutgers-production -f compose.production.yaml up -d
curl --fail "https://${MARKET_DOMAIN}/api/health"
```

Production is hardcoded to `DEMO_MODE=false`, secure cookies and an exact HTTPS origin. Network-facing non-demo production now refuses startup without that origin and secure cookies. `HOST=127.0.0.1` is the explicit local HTTP testing exception. Both containers have read-only root filesystems, dropped capabilities, process/memory limits and privilege escalation disabled. Only database/certificate volumes (plus the application's bounded temporary filesystem) remain writable. No Docker socket is mounted. The application image uses Node 24 on Alpine with distribution updates applied; npm/yarn are removed from the runtime, so invoke maintenance scripts directly with `node scripts/backup.mjs` or `node scripts/setup-admin.mjs` inside the container. The internal application network also prevents external email delivery; explicitly design an egress path before enabling notifications.

Traefik's image is built from a patch-version-pinned upstream image with Alpine updates applied; rebuild/review security updates regularly. Back up the production volume with the documented SQLite backup process, copying backups to independent durable storage. Do not reuse the local demo volume or remove production volumes during routine updates. Keep the existing backup/restore and rollback procedure above.

## Security checks and release policy

The implementation uses mature upstream tools:

- [Gitleaks](https://github.com/gitleaks/gitleaks): `.github/workflows/security.yml` scans all fetched Git history and the current checkout. CLI 8.30.1 is downloaded from the official release and verified against a fixed SHA-256. Output is redacted; no secret report artifact is uploaded. The CLI avoids the separate Gitleaks Action licensing requirement. Upstream is feature-complete with security patches continuing.
- [Anchore Grype](https://github.com/anchore/grype), through [scan-action](https://github.com/anchore/scan-action): CI scans the built runtime image, including OS and application packages; any HIGH/CRITICAL result fails the container job, including issues without a published fix. Database/download failures also fail the check. No blanket vulnerability exceptions are configured.
- `npm audit --omit=dev --audit-level=high` checks production npm dependencies. Dependabot proposes weekly npm, Docker, Compose and GitHub Actions updates. Update PRs still need review and passing checks.

All current workflow action references are fixed to verified full commit hashes, with read-only build/scanner token permissions and checkout credential persistence disabled. Only the Pages deployment job receives Pages and OIDC write permissions. Scanners run without deployment credentials. Container CI validates the production Compose configuration and HTTPS routing and exercises the image with the same read-only and restricted runtime settings before/after restart.

Before releasing, configure repository rules for the release branch to require `validate`, `container` and `secrets`, require pull requests, and disable bypass for normal publishing accounts. These remote settings are **not** activated by adding workflow files. Likewise, any hosting provider that deploys on push must wait for these checks or be switched to a controlled release process; a failed workflow alone does not stop an independent Railway auto-deploy. Review the Grype result and repair/update vulnerable packages before release. A clean scan is evidence for that tool and database at that time, not a guarantee of application security.

The weekly CI/security schedules run only once the workflows exist on the repository default branch. Manual dispatch and pull requests cover the release branch in the meantime. These changes do not deploy the service, provision a domain or configure external repository/hosting rules.

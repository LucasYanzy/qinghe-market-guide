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
DATABASE_PATH=./data/operational.sqlite DEMO_MODE=false COOKIE_SECURE=false npm start
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

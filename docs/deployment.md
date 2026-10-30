# Publishing and operating Qinghe

## Public market guide (GitHub Pages)

The public guide is built from `public-site.html`, independently of the full application:

```sh
npm ci
npm run build:public
npm run preview:public
```

The default URL prefix is `/qinghe-market-guide/`. To use a custom domain or another prefix, set `PUBLIC_BASE_PATH` when building and rebuild. `dist-public/` is the complete Pages artifact. It has no API dependency; dates, navigation, the price archive and help work on static hosting. The `/demo/` route previews customer, vendor and university screens with synthetic sample data. Filtering and navigation work locally; real orders, accounts, payments and management writes are unavailable in this target. This static preview is the current public release; the backend is not publicly deployed.

Live guide: https://lucasyanzy.github.io/qinghe-market-guide/

The source repository remains private. GitHub Pages serves only built website files from the separate public repository `LucasYanzy/qinghe-market-guide`, with `main` and `/` as its publishing source. It contains no backend, database, environment files or original Git history.

`.github/workflows/pages.yml` builds a private `public-market-guide` artifact from the source release branch. To update the live site, review the public build, copy `dist-public/` into the dedicated website checkout (preserving its `.git` and README), commit and push there. Its Pages branch deployment publishes that static commit automatically. The source CI token is not granted cross-repository permissions.

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

The project records in-person pickup and payment intentions. It does not process card payments or online EBT. Outbound email requires its own provider configuration and an explicit outbox command. The public guide is an independent community project, not an official Rutgers service; official announcements remain the authority for temporary closures.

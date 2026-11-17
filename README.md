# LuyFlow API

LuyFlow is a personal finance API: accounts, transactions, categories, budgets, reports, savings goals,
debts, groups and bank statement import/export. It is built with NestJS, PostgreSQL and Redis (BullMQ),
and lets TripSplit connect to user accounts through OAuth.

[![CI](https://github.com/Samnang-Vouen/luy_flow/actions/workflows/ci.yml/badge.svg)](https://github.com/Samnang-Vouen/luy_flow/actions/workflows/ci.yml)

| | |
| --- | --- |
| Container image | [`ghcr.io/samnang-vouen/luyflow`](https://github.com/Samnang-Vouen/luy_flow/pkgs/container/luyflow) |
| API docs | Swagger UI at `/api` (when `NODE_ENV` is not `production`) |
| TripSplit integration | [docs/tripsplit-integration.md](docs/tripsplit-integration.md) and [deploy/tripsplit/](deploy/tripsplit/) |

## Run it from a clean clone (Docker)

Requirements: Git and Docker with Compose v2 (Docker Desktop includes both). Nothing else is needed:
Node, PostgreSQL and Redis all run in containers.

```bash
git clone https://github.com/Samnang-Vouen/luy_flow.git
cd luy_flow
cp .env.example .env
```

Fill in the empty required values in `.env`:

| Variable | Value |
| --- | --- |
| `DATABASE_PASSWORD` | Any password (creates the database on first start) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Two different long random strings, e.g. from `openssl rand -hex 32` |

Then build and start everything:

```bash
docker compose up -d --build --wait
```

`--wait` returns once all three containers are healthy. Database migrations run automatically when the API starts.

**Check it works:**

```bash
curl http://localhost:3000/          # Hello World!
docker compose ps                    # api, db and redis all "healthy"
```

Open <http://localhost:3000/api> for the Swagger docs. Create a user with `POST /auth/register`, then log in with
`POST /auth/login`.

| Task | Command |
| --- | --- |
| Logs | `docker compose logs -f api` |
| Stop (keeps data) | `docker compose down` |
| Delete all data | `docker compose down -v` |
| Use another port | Set `API_PORT=3001` in `.env` |
| Run a published image instead of building | `LUYFLOW_IMAGE=ghcr.io/samnang-vouen/luyflow:latest docker compose up -d --no-build --wait` |

### What runs

| Service | Image | Data | Health check |
| --- | --- | --- | --- |
| `api` | Built from `Dockerfile` | none (stateless) | `GET /` answers 200 |
| `db` | `postgres:16` | volume `luyflow_pgdata` | `pg_isready` |
| `redis` | `redis:7` (append-only file on) | volume `luyflow_redisdata` | `redis-cli ping` |

Data survives `docker compose down` and container restarts; only `down -v` deletes the volumes.

## Docker image

The [`Dockerfile`](Dockerfile) builds in two stages:

1. **build:** installs all dependencies and compiles TypeScript.
2. **runtime:** `node:22-bookworm-slim` with production dependencies and the compiled `dist/` only.

- Runs as the unprivileged `node` user, not root.
- No source code, tests, `.env` files or secrets in the image ([`.dockerignore`](.dockerignore)).
  All configuration comes from environment variables at run time.
- A `HEALTHCHECK` on `GET /`. Pending migrations are applied on start, then Node runs as the main process, so
  `docker stop` shuts it down gracefully.
- OCI labels link the image to this repository, commit and version.
- Built for `linux/amd64` and `linux/arm64`.

## CI and image versions

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and push to `main`:

1. **Test:** `npm ci`, lint, build, unit tests, migrations, and e2e tests against PostgreSQL 16 and Redis 7.
2. **Image:** builds the Docker image. Pull requests only build it. Pushes to `main` and tags also push it to GHCR.
3. **Smoke test:** pulls the image that was just pushed, starts it with `compose.yaml` and checks that the API answers
   and the migrations ran.

| Event | Image tags |
| --- | --- |
| Every push to `main` | `sha-<7-char commit>` (e.g. `sha-3b9118f`) and `latest` |
| Git tag `vX.Y.Z` | `X.Y.Z`, `X.Y` and `sha-<commit>` |

Use a `sha-` or version tag to get a reproducible deployment, since `latest` moves.
To release a version: `git tag v0.3.0 && git push origin v0.3.0`.

## Run without Docker (development)

Requirements: Node 22 (see `.nvmrc`), PostgreSQL 16 and Redis 7 running locally.

```bash
npm ci
cp .env.example .env          # set DATABASE_HOST/PORT/USER/PASSWORD/NAME and the JWT secrets
npm run typeorm -- migration:run
npm run start:dev             # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run start:dev` | Start with reload on change |
| `npm run build` then `npm run start:prod` | Production build and start |
| `npm run lint` | Lint (oxlint) |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests. Database suites run only with `RUN_DATABASE_TESTS=1`, and only against a local test database. |
| `npm run typeorm -- migration:run` | Apply pending migrations (from `src/`) |
| `npm run migration:run:prod` | Apply pending migrations from the compiled `dist/` (used by the Docker image) |

## Modules

Every route except register, login, the password-reset routes, `GET /` and `/oauth/*` needs
`Authorization: Bearer <access token>`. Users only see their own data, except groups (shared with members) and
`/admin` (admins). The full list of routes and fields is in Swagger at `/api`.

| Area | Module | Base path | What it does |
| --- | --- | --- | --- |
| Access | `auth` | `/auth` | Register, log in, rotate refresh tokens, log out (one or all sessions), forgot and reset password |
| | `users` | `/users/me` | Profile and preferences, change password, list and revoke your sessions |
| | `sessions` | (used by `auth`, `users`) | Refresh-token sessions, stored as SHA-256 digests |
| | `admin` | `/admin` | Admins only: list and view users, activate or deactivate them, change roles |
| | `oauth` | `/oauth` | Lets TripSplit connect to an account without the password (see below) |
| Money records | `accounts` | `/accounts` | Cash and bank accounts, each in one currency (fixed after creation). Archive instead of delete. |
| | `categories` | `/categories` | Income and expense categories per user. Rename or archive. |
| | `payment-methods` | `/payment-methods` | Payment methods per user. Rename or archive. |
| | `transactions` | `/transactions` | Income and expenses, with search, filters, sorting and pagination |
| | `recurring-transactions` | `/recurring-transactions` | Recurring schedules: create, update, pause or resume, delete |
| Import and export | `imports` | `/imports`, `/import-profiles` | Upload a bank statement, processed in the background. Preview and edit rows (duplicates are flagged), then confirm. A confirmed import can be undone. Profiles store the column mapping per bank. |
| | `exports` | `/exports` | Download transactions as CSV or Excel for a month or a date range |
| Planning and insight | `budgets` | `/budgets` | Monthly budgets, overall or per category and currency, with progress against actual spending |
| | `reports` | `/reports` | Income, expenses, surplus and savings rate; totals by category; trends by day, week, month or year |
| | `recommendations` | `/recommendations` | Monthly savings suggestions, budget warnings and unusual category spending |
| Saving and sharing | `savings-goals` | `/savings-goals` | Goals with contributions, a currency and an optional `externalRef`. `Idempotency-Key` on create and contribute. |
| | `debts` | `/debts` | Money owed by or to the user, with payments |
| | `groups` | `/groups` | Shared pots: members, contributions and history |
| Support | `notifications` | `/notifications` | In-app notifications: list, unread count, mark as read |
| | `audit-logs` | `/audit-logs` | Each user's recent actions |
| | `common/idempotency` | (used by `savings-goals`) | Replays the first response when a POST is retried with the same `Idempotency-Key` |

Rate limits: 5 requests per minute per IP for login, register, the password-reset routes and the OAuth consent form;
30 for token refresh and logout; 100 for everything else.

### Automation modules

The application includes three authenticated modules:

- `recurring-transactions` lets users create, list, update, pause/resume, and delete recurring transaction schedules. It stores schedule details only; it does not yet execute transactions. Execution must be integrated with the Accounts/Transactions module.
- `notifications` provides in-app notification listing, unread counts, and mark-as-read. Other modules can create notifications through the exported `NotificationsService`; no email delivery or event producer is configured yet.
- `audit-logs` provides each user with their recent audit entries. The exported `AuditLogsService` can be called by other modules to record actions. Do not include passwords, tokens, or other secrets in audit metadata.

The new tables are created by the `AddAutomationModules` migration. Apply pending migrations with:

```bash
npm run typeorm -- migration:run
```

### Savings, debts and groups modules

- `savings-goals`: personal goals with contributions. A goal becomes `completed` when the saved amount reaches the target, and the user gets a notification.
- `debts`: money owed by or to the user, with payments. Overpayment is rejected; a debt becomes `paid` at zero.
- `groups`: shared pots. The creator is the owner; the owner adds members by email; members contribute and see the history. Non-members get 404.

Tables are created by the `AddSavingsDebtsGroups` migration. The schema is in `docs/erd-savings-debts-groups.md`. `accountId` on contributions and payments is a placeholder until the Accounts module exists.

Recurring schedules currently reference an account by ID without a database foreign key because the Accounts module is still being developed. Coordinate with its owner before integrating payment execution.

### OAuth (TripSplit)

`/oauth/authorize`, `/oauth/token` and `/oauth/revoke` let TripSplit connect to a LuyFlow account without seeing the
user's password. Configure the client with the `OAUTH_*` variables in `.env`. See
[docs/tripsplit-integration.md](docs/tripsplit-integration.md).

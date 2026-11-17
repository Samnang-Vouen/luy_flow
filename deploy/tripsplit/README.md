# Run LuyFlow locally (for TripSplit)

This folder runs the LuyFlow API on your machine with Docker, so TripSplit can call it during development
and the demo. It starts three containers:

| Container | What it is |
| --- | --- |
| `api` | The LuyFlow API, from the published image |
| `db` | PostgreSQL 16, storing LuyFlow's data in a Docker volume |
| `redis` | Redis 7, used by LuyFlow's background jobs |

You manage these yourselves: settings live in your `.env`, and the data lives on your machine.

## Requirements

- Docker Desktop (or Docker Engine with Compose v2)
- Access to the image on GitHub Container Registry. If the image is private, the LuyFlow team adds your
  GitHub account, and you log in once:

  ```sh
  docker login ghcr.io -u <your-github-username>
  # Password: a GitHub personal access token with the read:packages scope
  ```

## Start

```sh
cp .env.example .env
```

Fill in the empty values in `.env`:

- `DATABASE_PASSWORD`: any password
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: two different long random strings, e.g. from `openssl rand -hex 32`
- `OAUTH_CLIENT_SECRET`: another long random string. Put the **same value** in TripSplit as `LUYFLOW_CLIENT_SECRET`.
- `OAUTH_REDIRECT_URI`: TripSplit's callback URL, **exactly** as TripSplit sends it
- If a value contains `$`, wrap it in single quotes (`'like$this'`). Otherwise Compose drops everything from the `$` on.

Then:

```sh
docker compose up -d
```

On first start, LuyFlow creates its database tables automatically. This also happens after every upgrade.

**Check it works:** open <http://localhost:3001/api> for the Swagger docs, or run:

```sh
docker compose logs api        # look for "Nest application successfully started"
```

The containers are named `luyflow-api-1`, `luyflow-db-1` and `luyflow-redis-1`.
If you changed `LUYFLOW_PORT`, use that port instead of 3001 everywhere in this guide.

## Connect TripSplit to it

TripSplit connects with OAuth ("Connect LuyFlow"). Two things must be able to reach LuyFlow:

| Who | Calls | Needs |
| --- | --- | --- |
| **Your users' browsers** | `/oauth/authorize` (LuyFlow's login page) | A **public** address, e.g. `http://<your-server-ip>:3001`, or better an HTTPS address on your server |
| **Your TripSplit server** | `/oauth/token`, `/oauth/revoke`, and the API | The same public address, or `http://localhost:3001` if it runs on the same machine outside Docker |

If TripSplit itself runs in a Docker container on the same machine, `localhost` means that container, not
your machine. Use `http://host.docker.internal:3001` for server calls (on Linux, add
`extra_hosts: ["host.docker.internal:host-gateway"]` to your TripSplit service). The browser still needs the public address.

If you open port 3001 to the internet, use real secrets in `.env`, not example values.

Configure TripSplit with the same values as LuyFlow's `.env`:

| TripSplit | LuyFlow `.env` |
| --- | --- |
| `LUYFLOW_BASE_URL` | The public address of this server |
| `LUYFLOW_CLIENT_ID` | `OAUTH_CLIENT_ID` (`tripsplit`) |
| `LUYFLOW_CLIENT_SECRET` | `OAUTH_CLIENT_SECRET` |
| `LUYFLOW_REDIRECT_URI` | `OAUTH_REDIRECT_URI` |

For testing, create a LuyFlow user with `POST /auth/register` and use that email and password on LuyFlow's
login page. Every request is described in the API guide (`tripsplit-integration.md`) and the Postman
collection we sent along with this folder.

## Everyday commands

| Task | Command |
| --- | --- |
| Start | `docker compose up -d` |
| Stop (keeps data) | `docker compose down` |
| See API logs | `docker compose logs -f api` |
| Open the database | `docker compose exec db psql -U luyflow -d luyflow` (use your `DATABASE_USER` and `DATABASE_NAME`) |
| **Delete all data** and start fresh | `docker compose down -v`, then `docker compose up -d` |

## Upgrade to a new version

When the LuyFlow team announces a new version, change the tag in `.env`, e.g.
`LUYFLOW_IMAGE=ghcr.io/samnang-vouen/luyflow:0.3`, then:

```sh
docker compose pull
docker compose up -d
```

Your data is kept, and any new database changes are applied on start.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `Set JWT_ACCESS_SECRET in .env` (or a similar message) | That value is empty in `.env`. Fill it in. |
| `port is already allocated` | Something else uses port 3001. Set `LUYFLOW_PORT=3002` in `.env`. |
| `The "z" variable is not set` (or similar) warnings | A value in `.env` contains `$`. Wrap it in single quotes. |
| `denied` or `unauthorized` when pulling the image | Run `docker login ghcr.io` (see Requirements), or ask the LuyFlow team for access. |
| `password authentication failed` in the logs | The database was first created with a different password. Run `docker compose down -v` (**deletes data**) and start again. |
| LuyFlow shows "This connection request is invalid" | `OAUTH_CLIENT_SECRET` is empty, or the `client_id` or `redirect_uri` TripSplit sends doesn't match `.env` **exactly** (watch for `http`/`https`, trailing `/`). Restart after changing `.env`: `docker compose up -d`. |
| `/oauth/token` returns `invalid_client` | TripSplit's `LUYFLOW_CLIENT_SECRET` differs from `OAUTH_CLIENT_SECRET` |
| `/oauth/token` returns `invalid_grant` | The code was already used, expired (10 minutes), or `redirect_uri`/`code_verifier` don't match. Start the connection again. |
| Requests return `429 Too Many Requests` | Rate limit: the login page, login and register allow 5 per minute, everything else 100 per minute per IP. Wait a minute. |
| The API keeps restarting | Run `docker compose logs api` and send the LuyFlow team the error. |

## Notes

- Only use the values in this `.env` for local development. Don't reuse them anywhere real.
- OAuth needs image `0.2` or later. TripSplit's access tokens can't yet be limited to savings goals, so only call the endpoints in the API guide.

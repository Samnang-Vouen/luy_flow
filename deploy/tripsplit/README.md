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

`.env.example` comes with working demo values, so you can start right away. You can change them in `.env`:

- `DATABASE_PASSWORD`: any password
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: two different long random strings, e.g. from `openssl rand -hex 32`
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

| Who calls LuyFlow | Base URL |
| --- | --- |
| A browser, or a TripSplit API running directly on your machine | `http://localhost:3001` |
| A TripSplit API running in its own Docker container | `http://host.docker.internal:3001` |

Inside a container, `localhost` means that container itself, not your machine.
On Linux, add `extra_hosts: ["host.docker.internal:host-gateway"]` to your TripSplit service for that address to work.

Create a LuyFlow user with `POST /auth/register`, then log in with `POST /auth/login`. Every request is
described in the API guide (`tripsplit-integration.md`) and the Postman collection we sent along with this folder.

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
`LUYFLOW_IMAGE=ghcr.io/samnang-vouen/luyflow:0.2`, then:

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
| Requests return `429 Too Many Requests` | Rate limit: login and register allow 5 per minute, everything else 100 per minute per IP. Wait a minute. |
| The API keeps restarting | Run `docker compose logs api` and send the LuyFlow team the error. |

## Notes

- Only use the values in this `.env` for local development. Don't reuse them anywhere real.
- **OAuth isn't available yet,** so TripSplit logs in with a normal LuyFlow account for now.

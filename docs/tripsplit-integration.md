# TripSplit integration: LuyFlow savings-goal API

For the TripSplit team. This covers the LuyFlow endpoints you call for **Phase 1, "Save for a trip"**:
create a savings goal for a trip, add money to it and read progress.

The same requests are in [tripsplit.postman_collection.json](tripsplit.postman_collection.json),
with saved example responses you can use to start a Postman mock server.

> **Status:** savings goals with `currency`, `externalRef` and `Idempotency-Key` are ready.
> OAuth is **not** built yet, so for now you log in with a normal LuyFlow account (step 1).
> This is temporary: it means TripSplit handles a LuyFlow password, which OAuth will replace.

## Basics

| | |
| --- | --- |
| Base URL | `http://localhost:3000` when running locally. There's no `/api/v1` prefix. |
| Auth | `Authorization: Bearer <accessToken>` on every savings-goal call |
| Bodies | JSON, `Content-Type: application/json` |
| Amounts | Sent as numbers or numeric strings (`20`, `"20.00"`), returned as strings with 2 decimals (`"20.00"`, KHR too: `"5000.00"`) |
| Errors | `{ "statusCode": 422, "error": "Unprocessable Entity", "message": "..." }`. For validation errors (400), `message` is a list of strings. |
| API docs | Swagger UI at `/api`, only when `NODE_ENV` is not `production` |

### Rate limits (per IP address, per minute)

| Route | Limit |
| --- | --- |
| `POST /auth/login`, `POST /auth/register` | 5 |
| `POST /auth/refresh` | 30 |
| Everything else | 100 |

All TripSplit server calls come from one IP, so the 100 is shared across all your users.
Going over returns **429**. Back off and retry.

## Mapping to your plan

| Your endpoint | Calls | LuyFlow endpoint |
| --- | --- | --- |
| Connect check | L1 | `GET /users/me` |
| T5 create my goal for this trip | L3 | `POST /savings-goals` |
| T6 my progress | L4 | `GET /savings-goals/:id` |
| T7 add money | L5 | `POST /savings-goals/:id/contributions` |
| T8 list accounts | L2 | **Not needed.** Contributions don't use accounts. |

Field names differ from your proposal: `deadline` is **`targetDate`**, `savedAmount` is **`currentAmount`**,
and `status` is lowercase (`active`, `completed`, `cancelled`).

## Requests

The examples use `curl` with these shell variables:

```sh
BASE=http://localhost:3000
TOKEN=<accessToken from step 1>
```

### 1. Log in (temporary, until OAuth)

Create the account once (password of at least 8 characters):

```sh
curl -X POST $BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Sokha","email":"sokha@example.test","password":"Kampot-2026!"}'
```

```json
{ "id": "6a1d…", "name": "Sokha", "email": "sokha@example.test", "role": "user" }
```

Log in to get tokens:

```sh
curl -X POST $BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sokha@example.test","password":"Kampot-2026!"}'
```

```json
{ "accessToken": "eyJhbGciOi…", "refreshToken": "9f2c…" }
```

- The **access token lasts 15 minutes** and the **refresh token 7 days**.
- Before the access token expires, call `POST /auth/refresh` with `{"refreshToken":"…"}`. You get a new pair,
  and **the old refresh token stops working**, so always store the new one.
- A **401** on any call means the access token expired or was revoked. Refresh once and retry once.

Check the token works (L1):

```sh
curl $BASE/users/me -H "Authorization: Bearer $TOKEN"
```

```json
{ "id": "6a1d…", "name": "Sokha", "email": "sokha@example.test", "role": "user", "preferences": {} }
```

### 2. Create the trip goal (L3)

```sh
curl -X POST $BASE/savings-goals \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 0b6f1c9e-4e7a-4a51-9a51-2f0f3c2d7e11" \
  -d '{
    "name": "Kampot trip",
    "targetAmount": "200.00",
    "currency": "USD",
    "targetDate": "2026-12-20",
    "externalRef": { "source": "tripsplit", "id": "<tripId>" }
  }'
```

**201 Created**

```json
{
  "id": "3f6c1a2e-8d4b-4c1e-9a7f-5b2d1e0c9a88",
  "userId": "6a1d…",
  "name": "Kampot trip",
  "targetAmount": "200.00",
  "currentAmount": "0.00",
  "currency": "USD",
  "externalSource": "tripsplit",
  "externalId": "<tripId>",
  "targetDate": "2026-12-20",
  "status": "active",
  "createdAt": "2026-11-17T09:00:00.000Z",
  "updatedAt": "2026-11-17T09:00:00.000Z"
}
```

Save `id` in your `luyflow_goals` table. That's the only thing you need to store.

| Field | Rules |
| --- | --- |
| `name` | Required, up to 120 characters |
| `targetAmount` | Required, more than 0, at most 2 decimals |
| `targetDate` | Optional, `YYYY-MM-DD` |
| `currency` | Optional, an ISO 4217 code such as `USD` or `KHR`, default `USD`. **Can't be changed later.** |
| `externalRef` | Optional. `source`: 1–40 lowercase letters, digits, `-` or `_` (use `tripsplit`). `id`: up to 100 characters. Unique per user. **Can't be changed later.** |

`externalRef` is sent as an object but comes back as two flat fields, `externalSource` and `externalId`.

**409: a goal already exists for this trip.** The existing goal is in the body, so take `goal.id` and link to it:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "A savings goal already exists for this externalRef",
  "goal": { "id": "3f6c1a2e-…", "name": "Kampot trip", "currentAmount": "140.00", "…": "…" }
}
```

### 3. Read progress (L4)

```sh
curl $BASE/savings-goals/<goalId> -H "Authorization: Bearer $TOKEN"
```

**200 OK**: the goal, in the same shape as above. Show `currentAmount` of `targetAmount`, e.g. "Saved $140 of $200 (70%)".

- **404** means the goal was deleted in LuyFlow, or belongs to someone else. Remove your link and offer to create a new goal.
- Money added directly in LuyFlow shows up here too. Don't cache amounts.

### 4. Add money (L5)

```sh
curl -X POST $BASE/savings-goals/<goalId>/contributions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 7d2a4b8c-1f3e-4c5d-8e9f-0a1b2c3d4e5f" \
  -d '{ "amount": "20.00", "currency": "USD", "note": "From TripSplit" }'
```

**201 Created**

```json
{
  "goal": {
    "id": "3f6c1a2e-…",
    "name": "Kampot trip",
    "targetAmount": "200.00",
    "currentAmount": "160.00",
    "currency": "USD",
    "status": "active",
    "…": "…"
  },
  "contribution": {
    "id": "c41e…",
    "goalId": "3f6c1a2e-…",
    "userId": "6a1d…",
    "amount": "20.00",
    "note": "From TripSplit",
    "accountId": null,
    "createdAt": "2026-11-17T09:05:00.000Z"
  }
}
```

| Field | Rules |
| --- | --- |
| `amount` | Required, more than 0, at most 2 decimals |
| `currency` | Optional, but **send it**. If it differs from the goal's currency you get **422** and nothing is saved. We don't convert. |
| `note` | Optional, up to 255 characters |
| `accountId` | Leave out. Contributions don't move money between accounts. |

- **400 "Savings goal is not active"**: the goal reached its target (`status: completed`) or was cancelled.
  Hide "Add money" when `status` isn't `active`.
- A contribution can push the total past the target. The goal then becomes `completed`.

## Idempotency-Key: retries without double-counting

Send `Idempotency-Key` on **create goal** and **add money**. It's optional, up to 255 visible ASCII characters
(a UUID is ideal, e.g. `crypto.randomUUID()`), and scoped to the user.

Make **one new key per user action** (one tap on "Add $20"), and reuse it for every retry of that same action.

| You send | You get |
| --- | --- |
| A new key | The normal response. We store it for 24 hours. |
| The same key and the same request again | **The stored response**, with header `Idempotent-Replayed: true`. Nothing is added twice. |
| The same key with a different body or path | **422** |
| The same key while the first request is still running | **409**. Wait a moment and retry. |
| The same key after the first request failed (4xx) | Runs again. Failed requests release their key. |
| A key older than 24 hours | Treated as a new key |
| A malformed key | **400** |

This is what makes your section 9 plan safe: if LuyFlow times out, show 502, and when the user retries,
send the **same key**. The $20 is added once, whether or not the first request got through.

## Errors you'll see

| Status | Meaning | What TripSplit should do |
| --- | --- | --- |
| 400 | Invalid input (`message` lists the problems), malformed key, or goal not active | Show the message. Don't retry unchanged. |
| 401 | Access token expired or revoked | Refresh once, retry once. If the refresh fails, mark the link `BROKEN`. |
| 404 | Goal doesn't exist for this user | Remove the link (`SAVINGS_GOAL_NOT_FOUND`) |
| 409 | `externalRef` already used (body has `goal`), or the same key is still running | Link to `goal.id`, or retry shortly |
| 422 | Currency mismatch, or key reused with a different request | Fix the request. Use a new key for a new action. |
| 429 | Rate limit | Back off and retry |
| 5xx or no answer within 5 s | LuyFlow problem | Return `502 LUYFLOW_UNAVAILABLE`. A retry with the same key is safe. |

## Not ready yet

- **OAuth** (`/oauth/authorize`, `/oauth/token`, scopes). Until it's ready, use the login above.
- **A published Docker image** to run LuyFlow on your machine. Until then, use the Postman mock or a joint session.

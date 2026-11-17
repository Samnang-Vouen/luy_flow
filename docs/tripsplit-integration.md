# TripSplit integration: LuyFlow savings-goal API

For the TripSplit team. This covers the LuyFlow endpoints you call for **Phase 1, "Save for a trip"**:
create a savings goal for a trip, add money to it and read progress.

The same requests are in [tripsplit.postman_collection.json](tripsplit.postman_collection.json),
with saved example responses you can use to start a Postman mock server.

> **Status:** OAuth ("Connect LuyFlow") and savings goals with `currency`, `externalRef` and
> `Idempotency-Key` are ready. TripSplit never sees a LuyFlow password.

## Basics

| | |
| --- | --- |
| Base URL | Where LuyFlow runs, e.g. `http://localhost:3001` with our Docker setup. There's no `/api/v1` prefix. It must be reachable by **your server** (token and API calls) and by **your users' browsers** (the login page). |
| Auth | `Authorization: Bearer <access_token>` on every savings-goal call (step 1 gets the token) |
| Bodies | JSON, `Content-Type: application/json` |
| Amounts | Sent as numbers or numeric strings (`20`, `"20.00"`), returned as strings with 2 decimals (`"20.00"`, KHR too: `"5000.00"`) |
| Errors | `{ "statusCode": 422, "error": "Unprocessable Entity", "message": "..." }`. For validation errors (400), `message` is a list of strings. |
| API docs | Swagger UI at `/api`, only when `NODE_ENV` is not `production` |

### Rate limits (per IP address, per minute)

| Route | Limit |
| --- | --- |
| `POST /oauth/authorize` (the consent form), `POST /auth/login`, `POST /auth/register` | 5 |
| `POST /auth/refresh` | 30 |
| Everything else, including `POST /oauth/token` | 100 |

All TripSplit server calls come from one IP, so the 100 is shared across all your users.
Going over returns **429**. Back off and retry.

## Mapping to your plan

| Your endpoint | Calls | LuyFlow endpoint |
| --- | --- | --- |
| T1 start connecting | | Build the `/oauth/authorize` URL (step 1a) |
| T1b callback | | `POST /oauth/token` (step 1b) |
| T2 disconnect | | `POST /oauth/revoke` (step 1d) |
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
BASE=http://localhost:3001
CLIENT_ID=tripsplit
CLIENT_SECRET=<the OAUTH_CLIENT_SECRET in LuyFlow's .env>
REDIRECT_URI=https://34-87-166-91.sslip.io/api/v1/integrations/luyflow/callback
TOKEN=<access_token from step 1b>
```

### 1. Connect LuyFlow (OAuth)

This is the standard OAuth 2.0 authorization code flow with PKCE, as in your plan's section 6.3.

**Setup:** LuyFlow knows exactly one client, configured in LuyFlow's `.env`. Use the same values on your side:

| LuyFlow `.env` | Your env (plan section 6.2) |
| --- | --- |
| `OAUTH_CLIENT_ID=tripsplit` | `LUYFLOW_CLIENT_ID` |
| `OAUTH_CLIENT_SECRET=<long random string>` | `LUYFLOW_CLIENT_SECRET` |
| `OAUTH_REDIRECT_URI=<your callback URL>` | `LUYFLOW_REDIRECT_URI`. Must match **exactly**. |

#### 1a. Send the user to LuyFlow's login page (T1)

Make a random `state` and a PKCE pair, store both against the user, then open this URL in the user's browser:

```js
import { createHash, randomBytes } from 'node:crypto';
const state = randomBytes(16).toString('base64url');
const codeVerifier = randomBytes(32).toString('base64url');
const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

const url = new URL(`${LUYFLOW_BASE_URL}/oauth/authorize`);
url.search = new URLSearchParams({
  response_type: 'code',
  client_id: LUYFLOW_CLIENT_ID,
  redirect_uri: LUYFLOW_REDIRECT_URI,
  scope: 'savings:read savings:write',
  state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
}).toString();
```

LuyFlow shows a login form with **Allow** and **Deny**. Then it redirects the browser to your callback:

| User taps | Your callback receives |
| --- | --- |
| Allow (correct password) | `?code=…&state=…` |
| Deny | `?error=access_denied&error_description=…&state=…` |
| (bad request, e.g. no PKCE) | `?error=invalid_request&error_description=…&state=…` |

A wrong `client_id` or `redirect_uri` never redirects. LuyFlow shows an error page instead.
Always check that `state` matches the one you stored.

#### 1b. Swap the code for tokens (T1b, your server only)

```sh
curl -X POST $BASE/oauth/token \
  -d grant_type=authorization_code \
  -d code=<code from the callback> \
  -d redirect_uri=$REDIRECT_URI \
  -d code_verifier=<the codeVerifier you stored> \
  -d client_id=$CLIENT_ID \
  -d client_secret=$CLIENT_SECRET
```

The body is form-encoded. You can also send the client ID and secret as HTTP Basic auth.

**200 OK**

```json
{
  "access_token": "eyJhbGciOi…",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "9f2c4e6a…",
  "scope": "savings:read savings:write"
}
```

- A code works **once** and expires after **10 minutes**. A failed exchange also uses it up, so start again from 1a.
- Store both tokens encrypted (your plan's section 6.4). Then call `GET /users/me` (L1, below) to check the connection.

#### 1c. Refresh before the access token expires

The access token lasts **15 minutes** (`expires_in: 900`) and the refresh token 7 days.

```sh
curl -X POST $BASE/oauth/token \
  -d grant_type=refresh_token \
  -d refresh_token=<your refresh token> \
  -d client_id=$CLIENT_ID \
  -d client_secret=$CLIENT_SECRET
```

You get a new pair in the same shape. **The old refresh token stops working**, so always store the new one, and
lock the user's row while refreshing so two requests don't use the same token.
`invalid_grant` means the link is dead (revoked, expired or already used). Mark it `BROKEN` and ask the user to connect again.

#### 1d. Disconnect (T2)

```sh
curl -X POST $BASE/oauth/revoke \
  -d token=<the refresh token> \
  -d client_id=$CLIENT_ID \
  -d client_secret=$CLIENT_SECRET
```

Always **200 OK**. The refresh token stops working. The current access token still works until it expires (at most 15 minutes).

**OAuth errors** use the standard shape:

```json
{ "error": "invalid_grant", "error_description": "The code is invalid, expired, already used, or does not match" }
```

| `error` | Status | Meaning |
| --- | --- | --- |
| `invalid_client` | 401 | Wrong or missing `client_id` or `client_secret` |
| `invalid_grant` | 400 | Code or refresh token invalid, expired, already used, or not matching `redirect_uri` or `code_verifier` |
| `invalid_request` | 400 | A required field is missing |
| `unsupported_grant_type` | 400 | `grant_type` is not `authorization_code` or `refresh_token` |

**Good to know:**
- Users see the connection as **"TripSplit (OAuth)"** in their LuyFlow sessions and can end it there. Your next refresh then gets `invalid_grant`.
- The access token is a normal LuyFlow token. `scope` is recorded but **not enforced yet**, so the token can reach
  the whole account. Only call the endpoints in this guide.

**Testing without your UI:** create a user with `POST /auth/register` (`{"name","email","password"}`). Use that
email and password on the LuyFlow login page.

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
| 401 | Access token expired or revoked | Refresh once (step 1c), retry once. If the refresh gets `invalid_grant`, mark the link `BROKEN`. |
| 404 | Goal doesn't exist for this user | Remove the link (`SAVINGS_GOAL_NOT_FOUND`) |
| 409 | `externalRef` already used (body has `goal`), or the same key is still running | Link to `goal.id`, or retry shortly |
| 422 | Currency mismatch, or key reused with a different request | Fix the request. Use a new key for a new action. |
| 429 | Rate limit | Back off and retry |
| 5xx or no answer within 5 s | LuyFlow problem | Return `502 LUYFLOW_UNAVAILABLE`. A retry with the same key is safe. |

## Not ready yet

- **Scope enforcement.** Tokens are not yet limited to savings goals (see step 1).

To run LuyFlow yourselves, use our Docker setup (`deploy/tripsplit/README.md`).

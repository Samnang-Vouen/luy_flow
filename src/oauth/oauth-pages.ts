import type { AuthorizeParams } from './oauth.service';

// Server-rendered HTML for /oauth/authorize. Every value from the request is escaped.

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const layout = (title: string, body: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; background: #f4f6f5; color: #1c2321; margin: 0; }
  main { max-width: 360px; margin: 64px auto; background: #fff; padding: 28px; border-radius: 12px;
         box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  h1 { font-size: 1.3rem; margin: 0 0 12px; }
  label { display: block; margin: 14px 0 4px; font-size: .9rem; }
  input { width: 100%; box-sizing: border-box; padding: 10px; border: 1px solid #c8d0cd; border-radius: 8px; font-size: 1rem; }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  button { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #0f766e; font-size: 1rem; cursor: pointer; }
  .allow { background: #0f766e; color: #fff; }
  .deny { background: #fff; color: #0f766e; }
  .error { background: #fdecec; color: #8a1c1c; padding: 10px; border-radius: 8px; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;

const HIDDEN_FIELDS: (keyof AuthorizeParams)[] = [
  'response_type',
  'client_id',
  'redirect_uri',
  'state',
  'scope',
  'code_challenge',
  'code_challenge_method',
];

/** Login form with Allow and Deny. The OAuth request travels along in hidden fields. */
export function consentPage(
  clientName: string,
  params: AuthorizeParams,
  error?: string,
): string {
  const hidden = HIDDEN_FIELDS.filter((k) => params[k] !== undefined)
    .map(
      (k) =>
        `<input type="hidden" name="${k}" value="${escapeHtml(params[k] as string)}">`,
    )
    .join('');
  const name = escapeHtml(clientName);
  return layout(
    `Connect ${clientName} to LuyFlow`,
    `<h1>Connect ${name} to LuyFlow</h1>
<p><strong>${name}</strong> wants to <strong>see and add to your savings goals</strong>.
It will not see your password.</p>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize">
${hidden}
<label for="email">Email</label>
<input id="email" name="email" type="email" required autocomplete="username">
<label for="password">Password</label>
<input id="password" name="password" type="password" required autocomplete="current-password">
<div class="actions">
  <button class="deny" type="submit" name="decision" value="deny" formnovalidate>Deny</button>
  <button class="allow" type="submit" name="decision" value="allow">Allow</button>
</div>
</form>`,
  );
}

/** Shown when the request can't safely be sent back to the client (unknown client or redirect URI). */
export function invalidRequestPage(message: string): string {
  return layout(
    'Invalid connection request',
    `<h1>This connection request is invalid</h1>
<p class="error">${escapeHtml(message)}</p>
<p>Go back to the app you came from and try connecting again.</p>`,
  );
}

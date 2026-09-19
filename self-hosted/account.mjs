const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
export function accountPage({
  user,
  tokens = [],
  message = '',
  recoveryCode = '',
  token = '',
  mode = 'login',
  returnTo = '/workspace/',
}) {
  const input = (name, label, type = 'text', extra = '') =>
    `<label>${label}<input name="${name}" type="${type}" required ${extra}></label>`;
  const pass = (
    name = 'password',
    label = 'Password',
    auto = 'current-password',
  ) =>
    input(
      name,
      label,
      'password',
      `minlength="12" maxlength="128" autocomplete="${auto}"`,
    );
  const form = (action, fields, button) =>
    `<form method="post" action="/auth/${action}">${fields}<button>${button}</button></form>`;
  const returnField = `<input type="hidden" name="returnTo" value="${escape(returnTo)}">`;
  let body;
  if (!user) {
    if (mode === 'register')
      body = `<h1>Join VergeCommon</h1><p>Your username is your sign-in name. Save the recovery code shown after registration; no email reset service is required.</p>${form('register', input('username', 'Username', 'text', 'minlength="3" maxlength="40" autocomplete="username" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,39}"') + input('displayName', 'Display name', 'text', 'maxlength="80"') + pass('password', 'Password', 'new-password') + returnField, 'Create account')}<p><a href="/account">Already have an account? Sign in</a></p>`;
    else if (mode === 'recover')
      body = `<h1>Recover account</h1>${form('recover', input('username', 'Username') + input('recoveryCode', 'Recovery code', 'password', 'autocomplete="off"') + pass('password', 'New password', 'new-password'), 'Recover account')}<a href="/account">Back to sign-in</a>`;
    else
      body = `<h1>Welcome back</h1>${form('login', input('username', 'Username', 'text', 'autocomplete="username"') + pass() + returnField, 'Sign in')}<p><a href="/account?mode=register">Create an account</a> · <a href="/account?mode=recover">Use a recovery code</a></p>`;
  } else {
    body = `<h1>Your account</h1><p>Signed in as <strong>${escape(user.displayName)}</strong> (${escape(user.username)}).</p><p><a class="button" href="${escape(returnTo)}">Open your co-ops</a> · <a href="/network/">Explore projects</a></p>`;
    if (recoveryCode)
      body += `<section><h2>Save your recovery code now</h2><p>This is shown once. Keep it in your password manager. Anyone with it can reset your account.</p><code>${escape(recoveryCode)}</code></section>`;
    if (token)
      body += `<section><h2>Copy your device or agent token</h2><p>Shown once. Store it securely; paste it only into your trusted VergeCommon client.</p><code>${escape(token)}</code></section>`;
    body += `<h2>Devices and agents</h2><p>Create a separate token per device or agent. Tokens expire after 90 days. Revoke lost devices here. Revocation takes effect on their next request.</p>${form('token', input('label', 'Device or agent name', 'text', 'maxlength="80"') + '<label>Permissions<select name="scope"><option value="app:read">App: read my co-ops</option><option value="app:write">App: read and participate</option><option value="mcp:read">Agent: read my co-ops</option><option value="mcp:write">Agent: read and limited participation</option></select></label>', 'Create token')}<ul>${tokens.map((t) => `<li>${escape(t.label)} — ${escape(JSON.parse(t.scopes).join(', '))} — expires ${new Date(t.expires_at).toISOString().slice(0, 10)}${form('revoke', `<input type="hidden" name="id" value="${escape(t.id)}">`, 'Revoke')}</li>`).join('')}</ul><p>Agent endpoint: <code>https://vergecommon.com/mcp</code>. Send your token as a Bearer Authorization header. Agents cannot approve finance, legal agreements or membership privileges.</p>`;
    body += `<h2>Change password</h2><p>Changing your password signs out other sessions and revokes all device tokens.</p>${form('password', pass('currentPassword', 'Current password') + pass('newPassword', 'New password', 'new-password'), 'Change password')}<h2>Your records</h2><p><a href="/account/export">Download account and co-op records available to you</a></p><details><summary>Close account</summary><p>This removes your login and revokes access. Shared co-op records remain with their co-op for accountability; arrange stewardship transfer and any record-removal requests first. You cannot undo account closure.</p>${form('close', pass() + input('confirmation', 'Type CLOSE to confirm'), 'Permanently close account')}</details>${form('logout', '', 'Sign out')}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account · VergeCommon</title><style>body{font:17px/1.6 system-ui;margin:0;background:#f6f8f1;color:#173a2c}main{max-width:620px;padding:30px 22px;margin:auto}a{color:#145937}h1{font-size:2.6rem}h2{margin-top:2rem}form{display:grid;gap:14px;margin:16px 0}label{display:grid;gap:6px}input,select,button{font:inherit;padding:11px;border:1px solid #8b9e90;border-radius:7px}button,.button{background:#17513b;color:white;cursor:pointer}section{border:2px solid #17513b;padding:18px;background:#e6f1df}code{overflow-wrap:anywhere}li{border-bottom:1px solid #b3c3b4;padding:8px}nav{display:flex;gap:20px}.notice{padding:15px;background:#faefcc}details{margin:20px 0}</style></head><body><main><nav><a href="/">VergeCommon</a><a href="/network/">Community</a></nav>${message ? `<p role="status" class="notice">${escape(message)}</p>` : ''}${body}<footer><p><a href="https://github.com/jdhart81/verge-common/blob/build/coop-launch-readiness/PRIVACY.md">Privacy</a> · <a href="https://github.com/jdhart81/verge-common">Source</a></p></footer></main></body></html>`;
}

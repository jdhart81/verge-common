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
  const input = (name, label, type = 'text', extra = '', hint = '') =>
    `<div><label>${label}<input name="${name}" type="${type}" required ${extra}${hint ? ` aria-describedby="${name}-hint"` : ''}></label>${hint ? `<small id="${name}-hint" class="field-hint">${hint}</small>` : ''}</div>`;
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
      auto === 'new-password'
        ? 'Use 12–128 characters. A few memorable words work well.'
        : '',
    );
  const returnField = `<input type="hidden" name="returnTo" value="${escape(returnTo)}">`;
  const form = (action, fields, button) =>
    `<form method="post" action="/auth/${action}">${fields}${returnField}<button>${button}</button></form>`;
  const accountLink = (nextMode) =>
    escape(`/account?${new URLSearchParams({ mode: nextMode, returnTo })}`);
  let body;
  if (!user) {
    if (mode === 'register')
      body = `<h1>Join VergeCommon</h1><p>Bring your neighbors together around a place you care about. Your account gives you access to shared co-op workspaces.</p><p>No email address is required. After joining, save your recovery code: you will need it if you forget your password.</p>${form('register', input('username', 'Username', 'text', 'minlength="3" maxlength="40" autocomplete="username" autocapitalize="none" spellcheck="false" pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{2,39}"', 'Your sign-in name: 3–40 letters, numbers, underscores or hyphens. Start with a letter or number.') + input('displayName', 'Display name', 'text', 'maxlength="80" autocomplete="name"', 'The name shown on your account. You choose your member name when joining a co-op.') + pass('password', 'Password', 'new-password'), 'Create account')}<p><a href="${accountLink('login')}">Already have an account? Sign in</a></p>`;
    else if (mode === 'recover')
      body = `<h1>Recover account</h1><p>Use the recovery code you saved when creating or recovering your account. We do not send password reset emails. You will receive a new recovery code after this reset.</p>${form('recover', input('username', 'Username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false"') + input('recoveryCode', 'Recovery code', 'password', 'autocomplete="off"') + pass('password', 'New password', 'new-password'), 'Recover account')}<a href="${accountLink('login')}">Back to sign-in</a>`;
    else
      body = `<h1>Welcome back</h1><p>Sign in to care for your shared places and catch up with your co-op.</p>${form('login', input('username', 'Username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false"') + pass(), 'Sign in')}<p><a href="${accountLink('register')}">Create an account</a> · <a href="${accountLink('recover')}">Use a recovery code</a></p>`;
  } else {
    body = `<h1>Your account</h1><p>Signed in as <strong>${escape(user.displayName)}</strong> (${escape(user.username)}).</p>`;
    if (recoveryCode)
      body += `<section><h2>Save your recovery code now</h2><p>This is shown once. Keep it in your password manager. Anyone with it can reset your account.</p><code>${escape(recoveryCode)}</code></section>`;
    body += `<p class="account-actions"><a class="button" href="${escape(returnTo)}">${returnTo === '/workspace/' ? 'Open your co-ops' : 'Continue to your co-op'}</a><a href="/network/">Explore projects</a></p>`;
    if (token)
      body += `<section><h2>Copy your device or agent token</h2><p>Shown once. Store it securely; paste it only into your trusted VergeCommon client.</p><code>${escape(token)}</code></section>`;
    body += `<details class="account-devices"${token ? ' open' : ''}><summary>Devices and agents${tokens.length ? ` · ${tokens.length} connected` : ''}</summary><p>You can use VergeCommon in this browser without setting anything up here. Open this section to connect a separate app or an AI agent.</p><p>A token is an access key. Create a separate one per device or agent and choose what it can do. Tokens expire after 90 days. Revoke lost devices here; access ends on their next request.</p>${form('token', input('label', 'Device or agent name', 'text', 'maxlength="80"') + '<label>Permissions<select name="scope"><option value="app:read">App: read my co-ops</option><option value="app:write">App: read and participate</option><option value="mcp:read">Agent: read my co-ops</option><option value="mcp:write">Agent: read and limited participation</option></select></label>', 'Create token')}<ul>${tokens.map((t) => `<li>${escape(t.label)} — ${escape(JSON.parse(t.scopes).join(', '))} — expires ${new Date(t.expires_at).toISOString().slice(0, 10)}${form('revoke', `<input type="hidden" name="id" value="${escape(t.id)}">`, 'Revoke')}</li>`).join('')}</ul><p>Agent endpoint: <code>https://vergecommon.com/mcp</code>. Send your token as a Bearer Authorization header. Agents cannot approve finance, legal agreements or membership privileges.</p></details>`;
    body += `<h2>Change password</h2><p>Changing your password signs out other sessions and revokes all device tokens.</p>${form('password', pass('currentPassword', 'Current password') + pass('newPassword', 'New password', 'new-password'), 'Change password')}<h2>Your records</h2><p><a href="/account/export">Download account and co-op records available to you</a></p><details><summary>Close account</summary><p>This removes your login and revokes access. Shared co-op records remain with their co-op for accountability; arrange stewardship transfer and any record-removal requests first. You cannot undo account closure.</p>${form('close', pass() + input('confirmation', 'Type CLOSE to confirm'), 'Permanently close account')}</details>${form('logout', '', 'Sign out')}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account · VergeCommon</title><style>body{font:17px/1.6 system-ui;margin:0;background:#f6f8f1;color:#173a2c}main{max-width:620px;padding:30px 22px;margin:auto}a{color:#145937}h1{font-size:2.6rem}h2{margin-top:2rem}form{display:grid;gap:14px;margin:16px 0}label{display:grid;gap:6px}input,select,button{font:inherit;padding:11px;border:1px solid #8b9e90;border-radius:7px}button,.button{background:#17513b;color:white;cursor:pointer}section{border:2px solid #17513b;padding:18px;background:#e6f1df}code{overflow-wrap:anywhere}li{border-bottom:1px solid #b3c3b4;padding:8px}nav{display:flex;gap:20px}.notice{padding:15px;background:#faefcc}details{margin:20px 0}summary{cursor:pointer;font-weight:650;padding:12px 0;min-height:44px}.field-hint{font-size:14px;color:#4a6354;font-weight:400}.account-actions{display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin:24px 0}.button{display:inline-flex;padding:12px 18px;border-radius:7px;text-decoration:none;min-height:44px}.account-devices{border-top:1px solid #b3c3b4;border-bottom:1px solid #b3c3b4;padding:6px 0}input,select{min-width:0;width:100%;box-sizing:border-box}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #ad6810;outline-offset:3px}section h2{margin-top:0}</style></head><body><main><nav><a href="/">VergeCommon</a><a href="/network/">Community</a></nav>${message ? `<p role="status" class="notice">${escape(message)}</p>` : ''}${body}<footer><p><a href="https://github.com/jdhart81/verge-common/blob/build/coop-launch-readiness/PRIVACY.md">Privacy</a> · <a href="https://github.com/jdhart81/verge-common">Source</a></p></footer></main></body></html>`;
}

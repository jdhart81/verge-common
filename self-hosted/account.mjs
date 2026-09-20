import { escape, welcomePage } from './account-welcome.mjs';
export { escape } from './account-welcome.mjs';
export function accountPage({
  user,
  tokens = [],
  message = '',
  recoveryCode = '',
  token = '',
  mode = 'login',
  returnTo = '/workspace/',
  socialProviders = [],
  hasPassword = true,
  socialContent,
  providerPreview = false,
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
  if (!user && socialContent === undefined)
    return welcomePage({
      mode,
      returnTo,
      message,
      socialProviders,
      providerPreview,
    });
  let body;
  if (socialContent !== undefined) body = socialContent;
  else {
    body = `<h1>Your account</h1><p>Signed in as <strong>${escape(user.displayName)}</strong> (${escape(user.username)}).</p>`;
    if (recoveryCode)
      body += `<section><h2>Save your recovery code now</h2><p>This is shown once. Keep it in your password manager. Anyone with it can reset your account.</p><code>${escape(recoveryCode)}</code></section>`;
    body += `<p class="account-actions"><a class="button" href="${escape(returnTo)}">${returnTo === '/workspace/' ? 'Open your co-ops' : 'Continue to your co-op'}</a><a href="/network/">Explore projects</a></p>`;
    if (token)
      body += `<section><h2>Copy your device or agent token</h2><p>Shown once. Store it securely; paste it only into your trusted VergeCommon client.</p><code>${escape(token)}</code></section>`;
    body += `<details class="account-devices"${token ? ' open' : ''}><summary>Devices and agents${tokens.length ? ` · ${tokens.length} connected` : ''}</summary><p>You can use VergeCommon in this browser without setting anything up here. Open this section to connect a separate app or an AI agent.</p><p>A token is an access key. Create a separate one per device or agent and choose what it can do. Tokens expire after 90 days. Revoke lost devices here; access ends on their next request.</p>${form('token', input('label', 'Device or agent name', 'text', 'maxlength="80"') + '<label>Permissions<select name="scope"><option value="app:read">App: read my co-ops</option><option value="app:write">App: read and participate</option><option value="mcp:read">Agent: read my co-ops</option><option value="mcp:write">Agent: read and limited participation</option></select></label>', 'Create token')}<ul>${tokens.map((t) => `<li>${escape(t.label)} — ${escape(JSON.parse(t.scopes).join(', '))} — expires ${new Date(t.expires_at).toISOString().slice(0, 10)}${form('revoke', `<input type="hidden" name="id" value="${escape(t.id)}">`, 'Revoke')}</li>`).join('')}</ul><p>Agent endpoint: <code>https://vergecommon.com/mcp</code>. Send your token as a Bearer Authorization header. Agents cannot approve finance, legal agreements or membership privileges.</p></details>`;
    const passwordControls = hasPassword
      ? `<h2>Change password</h2><p>Changing your password signs out other sessions and revokes all device tokens.</p>${form('password', pass('currentPassword', 'Current password') + pass('newPassword', 'New password', 'new-password'), 'Change password')}`
      : `<h2>Set a backup password</h2><p>You signed in with a verified sign-in method. Your VergeCommon username is <strong>${escape(user.username)}</strong>. Use your saved recovery code to set a password for fallback access, native-app password login, or linking another provider.</p>${form('recover', `<input type="hidden" name="username" value="${escape(user.username)}">` + input('recoveryCode', 'Saved recovery code', 'password', 'autocomplete="off"') + pass('password', 'New password', 'new-password'), 'Set backup password')}`;
    body += `${passwordControls}<h2>Your records</h2><p><a href="/account/export">Download account and co-op records available to you</a></p><section id="close-account" class="account-closure"><h2>Permanently delete your account</h2><p>This revokes all access and removes your authored personal content, land records and uploaded evidence. Shared governance and numeric records may remain with identity fields removed; other members’ own content is separate. Transfer founder responsibility to another active steward from Members if your co-op has other active members. You cannot undo deletion. <a href="/privacy/#your-choices">Read about deletion and retained records</a>.</p>${hasPassword ? form('close', pass() + input('confirmation', 'Type DELETE to confirm'), 'Permanently delete account') : '<p>Verify with a linked provider below to delete this account, or set a backup password using your recovery code first.</p>'}</section>${form('logout', '', 'Sign out')}`;
  }
  if (socialContent === undefined && socialProviders.length) {
    const socialForm = (provider, action, text, extra = '') =>
      `<form method="post" action="/auth/social/start"><input type="hidden" name="provider" value="${escape(provider.id)}"><input type="hidden" name="action" value="${action}">${returnField}${provider.id === 'email' && action !== 'unlink' ? input('email', 'Email address', 'email', 'autocomplete="email" maxlength="254"') : ''}${extra}<button>${text}</button></form>`;
    if (user)
      body += `<h2>Connected sign-in methods</h2><p>Provider accounts are linked only with your consent, never by matching email addresses.</p>${socialProviders.map((p) => (p.linked ? `<p>${escape(p.name)} is linked.</p>${hasPassword ? socialForm(p, 'unlink', `Remove ${escape(p.name)} sign-in`, pass()) : ''}${socialForm(p, 'delete', `Verify with ${escape(p.name)} to delete my VergeCommon account`)}` : hasPassword ? socialForm(p, 'link', `Link ${escape(p.name)}`, pass()) : '')).join('')}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account · VergeCommon</title><link rel="icon" type="image/png" href="/icons/favicon-32.png?v=shared-canopy-1"><link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=shared-canopy-1"><style>body{font:17px/1.6 system-ui;margin:0;background:#f6f8f1;color:#173a2c}main{max-width:620px;padding:30px 22px;margin:auto}a{color:#145937}h1{font-size:2.6rem}h2{margin-top:2rem}form{display:grid;gap:14px;margin:16px 0}label{display:grid;gap:6px}input,select,button{font:inherit;padding:11px;border:1px solid #8b9e90;border-radius:7px}button,.button{background:#17513b;color:white;cursor:pointer}section{border:2px solid #17513b;padding:18px;background:#e6f1df}code{overflow-wrap:anywhere}li{border-bottom:1px solid #b3c3b4;padding:8px}nav{display:flex;gap:20px;align-items:center;flex-wrap:wrap}.brand{display:block;position:relative;width:216px;height:52px;overflow:hidden}.brand img{position:absolute;top:50%;width:100%;height:auto;transform:translateY(-50%)}.notice{padding:15px;background:#faefcc}details{margin:20px 0}summary{cursor:pointer;font-weight:650;padding:12px 0;min-height:44px}.field-hint{font-size:14px;color:#4a6354;font-weight:400}.account-actions{display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin:24px 0}.button{display:inline-flex;padding:12px 18px;border-radius:7px;text-decoration:none;min-height:44px}.account-devices{border-top:1px solid #b3c3b4;border-bottom:1px solid #b3c3b4;padding:6px 0}input,select{min-width:0;width:100%;box-sizing:border-box}input[type=checkbox]{width:auto;justify-self:start}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #ad6810;outline-offset:3px}section h2{margin-top:0}.account-closure{margin:28px 0;border-color:#b3c3b4;background:transparent;scroll-margin-top:24px}</style></head><body><main><nav><a href="/" class="brand"><img src="/brand/shared-canopy-logo-v1.png" width="1983" height="793" alt="VergeCommon home"></a><a href="/network/">Community</a></nav>${message ? `<p role="status" class="notice">${escape(message)}</p>` : ''}${body}<footer><p><a href="/privacy/">Privacy</a> · <a href="/support/">Get help</a> · <a href="https://github.com/jdhart81/verge-common">Source</a></p></footer></main></body></html>`;
}

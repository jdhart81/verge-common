export const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const icons = {
  google:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.41 13.93A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.93V7.48H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.52l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.79.5 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.48l3.34 2.59A6 6 0 0 1 12 5.95Z"/></svg>',
  apple:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c.03 3.3 2.9 4.4 2.93 4.41-.02.08-.46 1.57-1.51 3.11-.91 1.33-1.85 2.66-3.34 2.69-1.46.03-1.93-.87-3.6-.87-1.66 0-2.18.84-3.57.9-1.44.05-2.53-1.44-3.45-2.77-1.88-2.73-3.32-7.73-1.38-11.11a5.35 5.35 0 0 1 4.51-2.74c1.41-.03 2.74.95 3.6.95.86 0 2.46-1.18 4.15-1.01.71.03 2.72.29 4.01 2.19-.1.06-2.39 1.39-2.35 4.25ZM14.32 4.3c.77-.93 1.28-2.23 1.14-3.52-1.11.04-2.46.74-3.26 1.67-.72.82-1.36 2.14-1.19 3.4 1.23.1 2.5-.63 3.31-1.55Z"/></svg>',
};
const landscape = `<svg class="landscape" viewBox="0 0 700 900" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Neighboring meadows, woodland and a stream forming one connected conservation landscape"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="#8cb6a3"/><stop offset="1" stop-color="#e3e6b7"/></linearGradient><linearGradient id="shade" x2="0" y2="1"><stop offset=".35" stop-color="#123c32" stop-opacity="0"/><stop offset="1" stop-color="#102d24" stop-opacity=".96"/></linearGradient><g id="tree"><path d="M0 12V-72" stroke="#415744" stroke-width="5"/><ellipse cy="-65" rx="28" ry="43" fill="#365e40"/><ellipse cx="-10" cy="-74" rx="19" ry="30" fill="#628357"/></g><g id="flower"><path d="M0 10V-10m0 13-6-6" stroke="#a2b37a" stroke-width="2"/><circle cy="-11" r="5" fill="#e7d7a8"/><circle cy="-11" r="2" fill="#bb9954"/></g></defs><path fill="url(#sky)" d="M0 0h700v900H0z"/><circle cx="500" cy="210" r="74" fill="#edf0c9" opacity=".7"/><path d="M0 390Q180 180 390 340T750 260V900H0Z" fill="#729b77"/><path d="M0 415Q130 325 330 450T750 355V900H0Z" fill="#476f54"/><path d="M0 535 210 388 431 460 700 384V900H0Z" fill="#84935b"/><path d="M0 535 210 388 300 625 110 720 0 673Z" fill="#b3b374"/><path d="m210 388 221 72 118 195-249-30Z" fill="#728650"/><path d="m431 460 269-76v294l-151-23Z" fill="#9fa267"/><path d="M490 399q-120 137-39 206t-124 295" fill="none" stroke="#769f9a" stroke-width="25"/><g fill="none" stroke="#e4dfae" stroke-width="2" stroke-dasharray="5 7" opacity=".6"><path d="m0 535 210-147 90 237L110 720"/><path d="m210 388 221 72 118 195"/><path d="m300 625 249 30 151 23"/></g><g class="trees"><use href="#tree" x="99" y="475"/><use href="#tree" x="139" y="445"/><use href="#tree" x="184" y="413"/><use href="#tree" x="232" y="463"/><use href="#tree" x="250" y="519"/><use href="#tree" x="276" y="579"/><use href="#tree" x="315" y="629"/><use href="#tree" x="362" y="640"/><use href="#tree" x="575" y="428"/><use href="#tree" x="620" y="420"/><use href="#tree" x="669" y="399"/></g><g class="birds" fill="none" stroke="#294b3c" stroke-width="3" stroke-linecap="round"><path d="M174 242q10-9 20 0 10-9 20 0m45 31q8-7 16 0 8-7 16 0m-76 25q7-6 14 0 7-6 14 0"/></g><g class="blooms"><use href="#flower" x="63" y="555"/><use href="#flower" x="84" y="542"/><use href="#flower" x="120" y="527"/><use href="#flower" x="145" y="501"/><use href="#flower" x="198" y="597"/><use href="#flower" x="227" y="615"/><use href="#flower" x="245" y="631"/><use href="#flower" x="591" y="573"/><use href="#flower" x="621" y="580"/></g><path fill="url(#shade)" d="M0 0h700v900H0z"/></svg>`;
export function welcomePage({
  mode = 'login',
  returnTo = '/workspace/',
  message = '',
  socialProviders = [],
  providerPreview = false,
}) {
  const link = (next) =>
    escape(
      '/account?' +
        new URLSearchParams({
          mode: next,
          returnTo,
          ...(providerPreview ? { socialPreview: '1' } : {}),
        }),
    );
  const field = (name, label, type = 'text', extra = '') =>
    `<label class="field"><span>${label}</span><input name="${name}" type="${type}" placeholder="${label}" aria-label="${label}" required ${extra}></label>`;
  const username = field(
    'username',
    'Username',
    'text',
    'autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="40"',
  );
  const password = (
    name = 'password',
    label = 'Password',
    auto = 'current-password',
  ) =>
    field(
      name,
      label,
      'password',
      `autocomplete="${auto}" minlength="12" maxlength="128"`,
    );
  const returnField = `<input type="hidden" name="returnTo" value="${escape(returnTo)}">`;
  const recovery = mode === 'recover',
    register = mode === 'register';
  const title = recovery
    ? 'Recover your account'
    : register
      ? 'Join VergeCommon'
      : 'Welcome to VergeCommon';
  const intro = recovery
    ? 'Use your saved recovery code to get back to your co-op.'
    : register
      ? `Already a member? <a href="${link('login')}">Sign in</a>`
      : `New to the community? <a href="${link('register')}">Create an account</a>`;
  const fields =
    username +
    (recovery
      ? field('recoveryCode', 'Recovery code', 'password', 'autocomplete="off"')
      : register
        ? field(
            'displayName',
            'Display name',
            'text',
            'maxlength="80" autocomplete="name"',
          )
        : '') +
    password(
      'password',
      recovery ? 'New password' : 'Password',
      register || recovery ? 'new-password' : 'current-password',
    );
  const providers = ['google', 'apple']
    .map((id) => {
      const provider = socialProviders.find((p) => p.id === id),
        name = id === 'google' ? 'Google' : 'Apple';
      return provider
        ? `<form class="provider-form" method="post" action="/auth/social/start"><input type="hidden" name="provider" value="${id}"><input type="hidden" name="action" value="login">${returnField}<button class="provider">${icons[id]}Continue with ${name}</button></form>`
        : `<button class="provider unavailable" type="button" disabled aria-label="${name} sign-in coming soon">${icons[id]}${name} sign-in <small>Coming soon</small></button>`;
    })
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Account · VergeCommon</title><link rel="icon" href="/icons/favicon-32.png"><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202722;background:#fff}a{color:#315a42;text-underline-offset:4px}button,input{font:inherit}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #648852;outline-offset:4px}.layout{min-height:100svh;display:grid;grid-template-columns:1fr 1fr}.story{position:sticky;top:0;height:100svh;overflow:hidden;background:#65866b;color:white}.landscape{position:absolute;width:100%;height:100%;inset:0}.story-top{position:absolute;top:38px;left:42px;right:42px;display:flex;justify-content:space-between;gap:16px;font-size:13px;letter-spacing:.04em}.story-top span:last-child{opacity:.75}.story-copy{position:absolute;bottom:60px;left:46px;right:46px;max-width:520px}.eyebrow{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#d0dbb5}.story h2{font-size:clamp(36px,4vw,62px);font-weight:550;line-height:1.06;letter-spacing:-.05em;margin:18px 0}.story-copy p:last-child{color:#e0e7d7;font-size:17px;max-width:380px;line-height:1.65}.panel{display:flex;align-items:center;justify-content:center;padding:48px 36px;min-width:0}.content{width:100%;max-width:420px}.brand{display:block;width:180px;height:64px;position:relative;overflow:hidden;margin:0 auto 32px}.brand img{position:absolute;width:100%;height:auto;top:50%;transform:translateY(-50%)}h1{text-align:center;font-size:clamp(27px,2.6vw,35px);line-height:1.2;letter-spacing:-.04em;font-weight:650;margin:0 0 12px}.intro{text-align:center;color:#6c746e;font-size:14px;margin:0 0 30px}.intro a{font-weight:600}.credentials{display:grid;gap:12px;margin:0}.field span{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}input:not([type=hidden]){width:100%;height:56px;border:1px solid #d8ddd8;background:#fff;border-radius:9px;padding:0 17px;min-width:0;color:#202722}input::placeholder{color:#838b85}.hint{font-size:12px;color:#6b746d;line-height:1.6;margin:4px 0 10px}.primary,.provider{width:100%;min-height:49px;border-radius:999px;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;cursor:pointer}.primary{background:#1c2921;color:white;border:1px solid #1c2921;margin-top:4px}.primary:hover{background:#304d38}.providers{display:grid;gap:10px;margin-top:12px}.provider-form{margin:0}.provider{background:#fff;color:#202722;border:1px solid #dce1dc;padding:10px 18px}.provider:hover{background:#f4f7f2}.provider svg{width:20px;height:20px;flex-shrink:0}.provider small{font-size:10px;font-weight:500;background:#f1f3ef;color:#65705f;border-radius:20px;padding:3px 7px}.provider:disabled{cursor:default;color:#667065;background:#fafbf9}.unavailable svg{opacity:.6}.recovery{text-align:center;font-size:13px;margin:23px 0}.link-note{font-size:12px;color:#778078;line-height:1.55;text-align:center;margin:18px 4px}.notice{padding:14px 16px;background:#fff4d6;border:1px solid #eedca6;border-radius:10px;font-size:14px;margin:0 0 20px;overflow-wrap:anywhere}footer{display:flex;justify-content:center;gap:20px;margin-top:36px;font-size:12px}footer a{color:#788078;text-decoration:none}.birds{animation:drift 12s ease-in-out infinite alternate}.blooms{animation:bloom 7s ease-in-out infinite alternate}@keyframes drift{to{transform:translate(22px,-8px)}}@keyframes bloom{from{opacity:.65}to{opacity:1}}@media(prefers-reduced-motion:reduce){.birds,.blooms{animation:none}}@media(max-width:760px){.layout{grid-template-columns:1fr}.story{position:relative;height:260px}.story-top{top:22px;left:26px;right:26px;font-size:11px}.story-copy{left:26px;right:26px;bottom:18px}.story h2{font-size:36px;margin:9px 0}.story-copy p:last-child{display:none}.eyebrow{font-size:10px;margin:0}.landscape{object-position:center}.panel{padding:30px 24px 36px}.brand{width:150px;height:48px;margin-bottom:21px}h1{font-size:28px}.intro{margin-bottom:24px}footer{margin-top:28px}}@media(max-width:380px){.story{height:220px}.story h2{font-size:30px}.panel{padding-inline:20px}.provider{font-size:14px;gap:8px}}
</style></head><body><main class="layout"><aside class="story">${landscape}<div class="story-top"><span>VERGECOMMON</span><span>Conservation, together.</span></div><div class="story-copy"><p class="eyebrow">Small places. Shared possibility.</p><h2>Your land.<br>Our common ground.</h2><p>Connect with neighbors. Grow a conservation co-op. Make more room for nature, together.</p></div></aside><section class="panel" aria-label="Your VergeCommon account"><div class="content"><a class="brand" href="/"><img src="/brand/shared-canopy-logo-v1.png" width="1983" height="793" alt="VergeCommon home"></a><h1>${title}</h1><p class="intro">${intro}</p>${message ? `<p class="notice" role="status">${escape(message)}</p>` : ''}<form class="credentials" method="post" action="/auth/${recovery ? 'recover' : register ? 'register' : 'login'}">${fields}${returnField}<p class="hint">${recovery ? 'We do not send password reset emails. Recovery replaces your code and signs out other sessions.' : register ? 'No email address is required. Use a password of 12–128 characters and save the recovery code shown after joining.' : 'Welcome back. Use your VergeCommon username, or choose an available sign-in option below.'} <a href="/privacy/">Privacy policy</a></p><button class="primary">${recovery ? 'Recover account' : register ? 'Create account' : 'Log in'}</button></form>${!recovery ? `<div class="providers" aria-label="Other sign-in options">${providers}</div><p class="link-note">Already have an account? Sign in with your existing method before linking Google or Apple.</p>` : ''}<p class="recovery"><a href="${link(recovery ? 'login' : 'recover')}">${recovery ? 'Back to sign-in' : 'Use a recovery code'}</a></p><footer><a href="/network/">Explore the community</a><a href="/support/">Get help</a><a href="/privacy/">Privacy</a></footer></div></section></main></body></html>`;
}

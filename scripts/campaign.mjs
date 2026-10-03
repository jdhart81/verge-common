import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createResendClient } from '../self-hosted/resend.mjs';
import { escapeHtml as esc, normalizeEmail } from '../lib/updates-config.mjs';
export const unsubscribe = '{{{RESEND_UNSUBSCRIBE_URL}}}';
function fail(message) {
  throw new Error(message);
}
function checkSource(source) {
  // Deliberately small Markdown dialect: no raw HTML, images, or embedded content.
  if (/<\/?[a-z!]|!\[|&(?:#|[a-z]+;)/i.test(source))
    fail('Raw HTML, images and HTML entities are not allowed.');
  if (/\b(?:http|javascript|data|mailto):/i.test(source))
    fail('Links must use https:.');
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]*)\)/g)) {
    let url;
    try {
      url = new URL(match[1]);
    } catch {
      fail('Links must use https:.');
    }
    if (url.protocol !== 'https:' || url.username || url.password)
      fail('Links must use https: without credentials.');
  }
}
export function renderCampaign(source, env = process.env) {
  checkSource(source);
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!front) fail('A subject and preview front-matter block is required.');
  const fields = {};
  for (const line of front[1].split(/\r?\n/)) {
    const match = line.match(/^(subject|preview|replyTo):\s*(.+)$/);
    if (!match || fields[match[1]])
      fail('Use subject, preview and optional replyTo once each.');
    fields[match[1]] = match[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  if (!fields.subject || !fields.preview)
    fail('Subject and preview are required.');
  if (!env.VERGE_UPDATES_FROM || !env.VERGE_UPDATES_POSTAL_ADDRESS?.trim())
    fail('Sender identity and postal address are required.');
  const reply = fields.replyTo || env.VERGE_UPDATES_REPLY_TO;
  if (!normalizeEmail(reply)) fail('A valid reply-to address is required.');
  const inline = (line) =>
    esc(line)
      .replace(/\[([^\]]+)\]\((https:[^)]*)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const content = front[2]
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const heading = line.match(/^(#{1,3}) (.*)$/);
      return heading
        ? `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`
        : `<p>${inline(line)}</p>`;
    })
    .join('\n');
  const footer = `${env.VERGE_UPDATES_FROM}\n${env.VERGE_UPDATES_POSTAL_ADDRESS}\nUnsubscribe: ${unsubscribe}`;
  const rendered = {
    from: env.VERGE_UPDATES_FROM,
    reply_to: reply,
    subject: fields.subject,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(fields.subject)}</title></head><body><p>${esc(fields.preview)}</p>${content}<footer><p>${esc(env.VERGE_UPDATES_FROM)}</p><p>${esc(env.VERGE_UPDATES_POSTAL_ADDRESS)}</p><p><a href="${unsubscribe}">Unsubscribe</a></p></footer></body></html>`,
    text: `${fields.preview}\n\n${front[2]
      .trim()
      .replace(/^#{1,3} /gm, '')
      .replace(/\*\*/g, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')}\n\n${footer}\n`,
  };
  lintCampaign(rendered, env);
  return rendered;
}
export function lintCampaign(message, env = process.env) {
  if (
    !message.subject?.trim() ||
    !message.text?.trim() ||
    !message.html?.trim()
  )
    fail('Subject, HTML and a plain-text part are required.');
  if (!message.from || message.from !== env.VERGE_UPDATES_FROM)
    fail('Sender identity does not match the configured sender.');
  for (const content of [message.html, message.text]) {
    if (!content.includes(unsubscribe))
      fail('A hosted unsubscribe link is required in both parts.');
    if (
      !env.VERGE_UPDATES_POSTAL_ADDRESS?.trim() ||
      !content.includes(
        content === message.html
          ? esc(env.VERGE_UPDATES_POSTAL_ADDRESS)
          : env.VERGE_UPDATES_POSTAL_ADDRESS,
      )
    )
      fail('A postal address is required in both parts.');
    if (
      !content.includes(
        content === message.html ? esc(message.from) : message.from,
      )
    )
      fail('Sender identity is required in both parts.');
  }
  if (!message.html.includes(`href="${unsubscribe}"`))
    fail('A working hosted unsubscribe link is required.');
  if (
    /<\s*(script|img|svg|iframe|object|embed|link|style)\b|\son\w+\s*=|url\s*\(|\b(?:http|javascript|data):/i.test(
      message.html + message.text,
    )
  )
    fail('Images, tracking content, scripts and insecure links are forbidden.');
  for (const link of message.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    if (link[1] === unsubscribe) continue;
    if (!link[1].startsWith('https://')) fail('Links must use https:.');
  }
  return true;
}
export async function runCampaign(
  args,
  {
    env = process.env,
    client,
    read = readFile,
    write = writeFile,
    makeDir = mkdir,
    print = console.log,
  } = {},
) {
  const modes = ['--lint', '--preview', '--test', '--create', '--send'];
  const options = new Map();
  let file;
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      if (
        ![...modes, '--to', '--confirm'].includes(args[i]) ||
        options.has(args[i]) ||
        !args[i + 1] ||
        args[i + 1].startsWith('--')
      )
        fail('Invalid campaign arguments.');
      options.set(args[i], args[++i]);
    } else if (!file) file = args[i];
    else fail('Only one file is allowed.');
  }
  const selected = modes.filter((mode) => options.has(mode));
  if (
    selected.length > 1 ||
    (selected.length && file) ||
    (options.has('--to') && !options.has('--test')) ||
    (options.has('--confirm') && !options.has('--send'))
  )
    fail('Choose one campaign operation.');
  const mode = selected[0] || 'dry-run';
  const value = options.get(mode) || file;
  if (!value) fail('Provide a Markdown file or --send ID --confirm ID.');
  if (
    mode === '--send' &&
    (options.get('--confirm') !== value || !/^[\w-]+$/.test(value))
  )
    fail('Sending requires --send ID --confirm ID with identical IDs.');
  if (env.CI && ['--test', '--create', '--send'].includes(mode))
    fail('Network operations are disabled in CI.');
  const provider = () => {
    if (!env.RESEND_API_KEY || !env.VERGE_UPDATES_SEGMENT_ID)
      fail('API key and segment are required.');
    return (
      client ??
      createResendClient({
        apiKey: env.RESEND_API_KEY,
        trackingApiKey:
          env.VERGE_UPDATES_TRACKING_API_KEY || env.RESEND_API_KEY,
      })
    );
  };
  if (mode === '--send') {
    const api = provider();
    const draft = await api.getBroadcast(value);
    if (
      draft.status !== 'draft' ||
      draft.segment_id !== env.VERGE_UPDATES_SEGMENT_ID
    )
      fail('Only a draft in the configured segment may be sent.');
    lintCampaign(draft, env);
    const count = await api.countSegment(draft.segment_id);
    print(
      `Recipient segment: ${draft.segment_id}; subscribed contacts: ${count}`,
    );
    await api.sendBroadcast(value);
    print(`Broadcast submitted: ${value}`);
    return;
  }
  const source = await read(value, 'utf8');
  const message = renderCampaign(source, env);
  if (source.includes('TODO(Justin)'))
    print('Warning: TODO(Justin) copy remains.');
  if (['--test', '--create'].includes(mode) && source.includes('TODO(Justin)'))
    fail('Replace TODO(Justin) copy before creating or sending.');
  if (mode === '--preview') {
    const slug = basename(value, '.md').replace(/[^a-zA-Z0-9_-]/g, '-');
    const directory = resolve('outputs/campaign-preview');
    await makeDir(directory, { recursive: true });
    await write(resolve(directory, `${slug}.html`), message.html);
    await write(resolve(directory, `${slug}.txt`), message.text);
    print(`Preview written: ${slug}`);
  } else if (mode === '--test') {
    const to = normalizeEmail(options.get('--to'));
    if (!to) fail('A valid --to address is required.');
    // Transactional test sends cannot expand broadcast unsubscribe placeholders.
    const testMessage = {
      ...message,
      to,
      html: message.html.replace(
        `<a href="${unsubscribe}">Unsubscribe</a>`,
        'Unsubscribe (test only; hosted link expands in broadcasts)',
      ),
      text: message.text.replace(
        unsubscribe,
        '(test only; hosted link expands in broadcasts)',
      ),
    };
    await provider().sendEmail(testMessage);
    print('Test email submitted.');
  } else if (mode === '--create') {
    const api = provider();
    const count = await api.countSegment(env.VERGE_UPDATES_SEGMENT_ID);
    const draft = await api.createBroadcast({
      ...message,
      segment_id: env.VERGE_UPDATES_SEGMENT_ID,
    });
    print(
      `Draft ${draft.id}; recipient segment: ${env.VERGE_UPDATES_SEGMENT_ID}; subscribed contacts: ${count}`,
    );
  } else
    print(
      mode === '--lint'
        ? 'Campaign lint passed.'
        : 'Dry-run: campaign lint passed; no network calls.',
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runCampaign(process.argv.slice(2)).catch(() => {
    console.error(
      'Campaign aborted. Check arguments, content, configuration and provider access.',
    );
    process.exitCode = 1;
  });
}

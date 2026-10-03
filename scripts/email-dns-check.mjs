import * as dns from 'node:dns/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function checkEmailDns({
  resolver = dns,
  domain = 'vergecommon.com',
} = {}) {
  const hostname = (value) => value.toLowerCase().replace(/\.$/, '');
  const txt = async (name) =>
    (await resolver.resolveTxt(name)).map((chunks) => chunks.join(''));
  const checks = [
    [
      'DKIM',
      async () =>
        (await txt(`resend._domainkey.${domain}`)).some((value) =>
          /(?:^|;)\s*p=[^;\s]+/.test(value),
        ),
    ],
    [
      'send SPF',
      async () => {
        const rows = (await txt(`send.${domain}`)).filter((v) =>
          v.startsWith('v=spf1'),
        );
        return (
          rows.length === 1 && rows[0] === 'v=spf1 include:amazonses.com ~all'
        );
      },
    ],
    [
      'send MX',
      async () =>
        (await resolver.resolveMx(`send.${domain}`)).some(
          (v) =>
            v.priority === 10 &&
            hostname(v.exchange) === 'feedback-smtp.us-east-1.amazonses.com',
        ),
    ],
    [
      'rsend CNAME',
      async () =>
        (await resolver.resolveCname(`rsend.${domain}`)).some(
          (v) => hostname(v) === 'send.forge.rmta.net',
        ),
    ],
    [
      'DMARC',
      async () =>
        (await txt(`_dmarc.${domain}`)).some((v) => /^v=DMARC1\s*;/.test(v)),
    ],
    [
      'Inbound forwarding MX',
      async () => {
        const rows = await resolver.resolveMx(domain);
        return [1, 2, 3, 4, 5].every((n) =>
          rows.some(
            (v) =>
              hostname(v.exchange) === `eforward${n}.registrar-servers.com`,
          ),
        );
      },
    ],
  ];
  const results = [];
  for (const [name, check] of checks) {
    try {
      results.push({ name, pass: Boolean(await check()) });
    } catch {
      results.push({ name, pass: false });
    }
  }
  return results;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const results = await checkEmailDns();
  console.table(
    results.map(({ name, pass }) => ({
      Check: name,
      Result: pass ? 'PASS' : 'FAIL',
    })),
  );
  if (results.some((row) => !row.pass)) process.exitCode = 1;
}

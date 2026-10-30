// Worked example for docs/QUICKSTART.md: a woodland treatment plan checked by VergeCommon, then
// checked again from its downloaded Landscape Package by @viridis/dfm-core alone. The two must
// agree, which is what lets anyone reproduce a plan check stored in VergeCommon. Synthetic data.
// Exits non-zero if any value drifts from the documented output.
//   node scripts/quickstart-example.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  canonicalHashSync,
  checkConnectivitySync,
  fromLandscapePackage,
} from '@viridis/dfm-core';

const fixture = fileURLToPath(
  new URL('./dfm-contract-fixture.mjs', import.meta.url),
);
const { package: pkg, stored } = JSON.parse(
  execFileSync(process.execPath, [fixture], { encoding: 'utf8' }),
);
const input = fromLandscapePackage(pkg);
const result = checkConnectivitySync(input);
const lost = (links) =>
  links
    .map((link) => `${link.a}-${link.b} (${link.causes.join(', ')})`)
    .join('; ');

const expected = [
  ['engine', 'dfm-connectivity-0.2.0', stored.engine, result.engine],
  [
    'input checksum',
    'sha256:af1aae770551cf36ebd9ed3309991108ba0cd6d7ae9fef303e52ca702baba21b',
    stored.inputChecksum,
    canonicalHashSync(input),
  ],
  ['status', 'fail', stored.status, result.status],
  [
    'lost links',
    'core-A-core-B (harvest-3)',
    lost(stored.lostLinks),
    lost(result.lostLinks),
  ],
  ['pinched links', 0, stored.pinchedLinks.length, result.pinchedLinks.length],
  [
    'committed corridor m2',
    '72000.79',
    stored.consent.committedM2.toFixed(2),
    result.consent.committedM2.toFixed(2),
  ],
  [
    'proposed corridor m2',
    '72000.69',
    stored.consent.proposedM2.toFixed(2),
    result.consent.proposedM2.toFixed(2),
  ],
];

let drift = false;
console.log(
  'Plan: Synthetic winter harvest, one consented 100 ha woodlot, two units',
);
for (const [name, want, vergeCommon, dfmCore] of expected) {
  const ok =
    String(vergeCommon) === String(want) && String(dfmCore) === String(want);
  drift ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(22)} ${String(want)}`);
  if (!ok)
    console.log(
      `     VergeCommon stored ${vergeCommon}; dfm-core computed ${dfmCore}`,
    );
}
if (drift) {
  console.error('Does not match docs/QUICKSTART.md');
  process.exit(1);
}
console.log('VergeCommon and dfm-core agree. Matches docs/QUICKSTART.md');

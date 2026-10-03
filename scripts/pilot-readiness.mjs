#!/usr/bin/env node
// Local pre-pilot review. No state writes, manifest URL fetches or enrollment.
import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runChecks, certificateExpiry, PUBLIC_ROUTES } from './launch-gate.mjs';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const SHA = /^[a-f0-9]{40}$/;
const TOKEN = /^[a-zA-Z0-9_-]{1,80}$/;
const STATES = ['PASS', 'FAIL', 'UNVERIFIED', 'NOT_APPLICABLE'];
export const GATES = Object.freeze({
  'release-checks': { age: DAY },
  'privacy-access-review': { age: 30 * DAY },
  'provider-revocation': { age: 30 * DAY, optional: 'providers' },
  'custody-backup': { age: 30 * DAY, custody: 'backup' },
  'custody-apple': { age: 30 * DAY, custody: 'apple' },
  'custody-vault': { age: 30 * DAY, custody: 'vault' },
  'independent-archives-ledger': { age: 30 * DAY },
  'backup-under-24h': { age: DAY, exclusive: true },
  'restore-under-30d': { age: 30 * DAY, exclusive: true },
  'operations-under-2h': { age: 2 * HOUR },
  'alert-failure-recovery': { age: 30 * DAY },
  'mac-stale-run-coverage': { age: 30 * DAY },
  'two-operators-report-rehearsal': { age: 30 * DAY },
  'urgent-contact-rehearsal': { age: 30 * DAY },
  'signin-device-accessibility': { age: 30 * DAY },
  'reminder-device-display': { age: 30 * DAY, optional: 'reminders' },
  'consenting-scope-support': { age: 30 * DAY },
  'owner-go-no-go': { age: DAY },
});

function invalid() {
  throw new Error('INVALID_INPUT');
}
function object(value, fields, required = fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !fields.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
}
function token(value) {
  if (typeof value !== 'string' || !TOKEN.test(value)) invalid();
}
function originValue(value) {
  if (typeof value !== 'string') invalid();
  let url;
  try {
    url = new URL(value);
  } catch {
    invalid();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.origin !== value ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    invalid();
  return url;
}
function sha(value) {
  if (typeof value !== 'string' || !SHA.test(value)) invalid();
}
function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value)
    invalid();
  return time;
}

export function validateManifest(manifest) {
  object(manifest, [
    'schema',
    'environment',
    'targetOrigin',
    'candidateCommit',
    'operatingConfig',
    'scope',
    'custody',
    'gates',
  ]);
  if (
    manifest.schema !== 1 ||
    !['local', 'staging', 'production'].includes(manifest.environment)
  )
    invalid();
  originValue(manifest.targetOrigin);
  sha(manifest.candidateCommit);
  token(manifest.operatingConfig);
  object(manifest.scope, ['providers', 'reminders']);
  for (const value of Object.values(manifest.scope))
    if (typeof value !== 'boolean') invalid();
  object(manifest.custody, ['backup', 'apple', 'vault']);
  for (const value of Object.values(manifest.custody)) {
    object(value, ['credentialRef', 'custodian']);
    token(value.credentialRef);
    token(value.custodian);
  }
  if (
    !Array.isArray(manifest.gates) ||
    manifest.gates.length > Object.keys(GATES).length
  )
    invalid();
  const seen = new Set();
  for (const gate of manifest.gates) {
    object(
      gate,
      [
        'id',
        'result',
        'time',
        'evidenceRef',
        'reviewer',
        'operator',
        'candidateCommit',
        'deployedCommit',
        'operatingConfig',
        'credentialRef',
      ],
      ['id', 'result'],
    );
    if (
      !Object.hasOwn(GATES, gate.id) ||
      seen.has(gate.id) ||
      !STATES.includes(gate.result)
    )
      invalid();
    seen.add(gate.id);
    for (const field of [
      'evidenceRef',
      'reviewer',
      'operator',
      'operatingConfig',
      'credentialRef',
    ])
      if (Object.hasOwn(gate, field)) token(gate[field]);
    for (const field of ['candidateCommit', 'deployedCommit'])
      if (Object.hasOwn(gate, field)) sha(gate[field]);
    if (Object.hasOwn(gate, 'time')) timestamp(gate.time);
  }
  return manifest;
}

// Machine checks are always collected by the existing launch gate. Human gates
// cannot be satisfied by launch PASS results or an aggregate test count.
export function evaluateReadiness(
  manifest,
  {
    candidateCommit,
    environment,
    operatingConfig,
    origin = null,
    now = Date.now(),
    automated = null,
    deployedCommit = null,
  } = {},
) {
  validateManifest(manifest);
  sha(candidateCommit);
  token(operatingConfig);
  if (
    !['local', 'staging', 'production'].includes(environment) ||
    !Number.isFinite(now)
  )
    invalid();
  const contextMatches =
    candidateCommit === manifest.candidateCommit &&
    environment === manifest.environment &&
    operatingConfig === manifest.operatingConfig &&
    origin === manifest.targetOrigin;
  const deployedMatches =
    typeof deployedCommit === 'string' &&
    SHA.test(deployedCommit) &&
    deployedCommit === candidateCommit;
  const gates = [];
  const record = (id, result, reason, kind = 'human-attestation') =>
    gates.push({ id, result, reason, kind });
  const requiredMachineNames = [
    ...PUBLIC_ROUTES.map((path) => `route ${path}`),
    'build commit',
    'no placeholder sign-in buttons',
    'Apple client secret',
    'single contact address',
    'no unbuilt promises in public copy',
    'terms required at sign-up',
    ...(manifest.targetOrigin.startsWith('https:')
      ? ['TLS certificate', 'HSTS header']
      : []),
  ];
  const machines = automated?.filter((row) => row.status !== 'MANUAL') ?? [];
  record(
    'automated-launch',
    !contextMatches
      ? 'UNVERIFIED'
      : machines.some((row) => row.status === 'FAIL')
        ? 'FAIL'
        : !machines.length ||
            requiredMachineNames.some(
              (name) => !machines.some((row) => row.name === name),
            ) ||
            machines.some(
              (row) =>
                row.status !== 'PASS' &&
                !(
                  row.status === 'SKIP' &&
                  row.name === 'TLS certificate' &&
                  manifest.targetOrigin.startsWith('http:')
                ),
            ) ||
            !machines.some(
              (row) => row.gate === 'BL-01' && row.status === 'PASS',
            ) ||
            !deployedMatches
          ? 'UNVERIFIED'
          : 'PASS',
    !deployedMatches
      ? 'exact-deployed-build-unverified'
      : 'launch-machine-results-only',
    'automated',
  );
  for (const [id, rule] of Object.entries(GATES)) {
    const entry = manifest.gates.find((gate) => gate.id === id);
    const na = rule.optional && manifest.scope[rule.optional] === false;
    if (!entry) {
      record(id, 'UNVERIFIED', 'missing-evidence');
      continue;
    }
    if (!contextMatches) {
      record(id, 'UNVERIFIED', 'wrong-review-context');
      continue;
    }
    if (entry.result === 'UNVERIFIED') {
      record(id, 'UNVERIFIED', 'not-attested');
      continue;
    }
    if (entry.result === 'FAIL') {
      record(id, 'FAIL', 'attested-failure');
      continue;
    }
    if (entry.result === 'NOT_APPLICABLE' && !na) {
      record(id, 'UNVERIFIED', 'required-gate');
      continue;
    }
    const age = entry.time ? now - timestamp(entry.time) : NaN;
    if (
      !Number.isFinite(age) ||
      age < 0 ||
      (rule.exclusive ? age >= rule.age : age > rule.age)
    ) {
      record(id, 'UNVERIFIED', 'missing-stale-or-future-time');
      continue;
    }
    if (!entry.evidenceRef || !entry.reviewer || !entry.operator) {
      record(id, 'UNVERIFIED', 'missing-accountability');
      continue;
    }
    if (
      ['privacy-access-review', 'two-operators-report-rehearsal'].includes(
        id,
      ) &&
      entry.reviewer === entry.operator
    ) {
      record(id, 'UNVERIFIED', 'independent-reviewer-required');
      continue;
    }
    if (rule.custody) {
      const expected = manifest.custody[rule.custody];
      if (
        entry.credentialRef !== expected.credentialRef ||
        entry.operator !== expected.custodian
      ) {
        record(id, 'UNVERIFIED', 'credential-or-custodian-changed');
        continue;
      }
    } else if (
      entry.candidateCommit !== candidateCommit ||
      entry.deployedCommit !== deployedCommit ||
      !deployedMatches ||
      entry.operatingConfig !== operatingConfig
    ) {
      record(id, 'UNVERIFIED', 'wrong-build-or-operating-config');
      continue;
    }
    if (entry.result === 'PASS' && na) {
      record(id, 'UNVERIFIED', 'scope-requires-explicit-not-applicable');
      continue;
    }
    record(
      id,
      entry.result,
      rule.custody
        ? 'custody-attestation-not-possession-proof'
        : 'dated-private-evidence-attestation',
    );
  }
  const eligibleForPilotReview = gates.every((gate) =>
    ['PASS', 'NOT_APPLICABLE'].includes(gate.result),
  );
  return {
    schema: 1,
    environment,
    targetOrigin: manifest.targetOrigin,
    candidateCommit,
    deployedCommit:
      typeof deployedCommit === 'string' && SHA.test(deployedCommit)
        ? deployedCommit
        : null,
    operatingConfig,
    observedAt: new Date(now).toISOString(),
    eligibleForPilotReview,
    gates,
    automatedChecks: machines
      .filter(
        (row) =>
          requiredMachineNames.includes(row.name) ||
          [
            'google sign-in redirect',
            'apple sign-in redirect',
            'TLS certificate',
          ].includes(row.name),
      )
      .map((row) => ({
        gate: row.gate,
        name: row.name,
        result:
          row.status === 'SKIP'
            ? 'NOT_APPLICABLE'
            : ['PASS', 'FAIL'].includes(row.status)
              ? row.status
              : 'UNVERIFIED',
      })),
    postPilot: { gate: 'BL-13', result: 'UNVERIFIED', requiredForStart: false },
    broaderAnnouncement: {
      gate: 'BL-16',
      result: 'UNVERIFIED',
      requiredForStart: false,
    },
  };
}

async function readBounded(path) {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW,
  );
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > 32768) invalid();
    const buffer = Buffer.alloc(32769);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 32768) invalid();
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally {
    await file.close();
  }
}

export async function main(argv) {
  try {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
      const key = argv[i];
      if (
        ![
          '--manifest',
          '--candidate',
          '--environment',
          '--config',
          '--origin',
          '--json',
        ].includes(key) ||
        Object.hasOwn(args, key)
      )
        invalid();
      args[key] = key === '--json' ? true : argv[++i];
      if (
        args[key] === undefined ||
        (typeof args[key] === 'string' && args[key].startsWith('--'))
      )
        invalid();
    }
    if (!args['--manifest']) invalid();
    const manifest = validateManifest(await readBounded(args['--manifest']));
    sha(args['--candidate']);
    token(args['--config']);
    if (!['local', 'staging', 'production'].includes(args['--environment']))
      invalid();
    let automated = null,
      deployedCommit = null;
    if (args['--origin']) {
      // Only this explicit operator argument is fetched, never manifest values.
      const url = originValue(args['--origin']);
      const fetchImpl = (input, init = {}) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(10000) });
      try {
        const health = await fetchImpl(new URL('/healthz', url), {
          redirect: 'manual',
        });
        const body = await health.json();
        if (
          health.status === 200 &&
          body.status === 'ok' &&
          typeof body.commit === 'string' &&
          SHA.test(body.commit)
        )
          deployedCommit = body.commit;
        const tlsExpiry = await certificateExpiry(url.origin);
        const policy = await open(
          new URL('../SECURITY.md', import.meta.url),
          'r',
        );
        let securityPolicy;
        try {
          securityPolicy = await policy.readFile('utf8');
        } finally {
          await policy.close();
        }
        automated = await runChecks({
          origin: url.origin,
          fetchImpl,
          expectCommit: args['--candidate'],
          securityPolicy,
          tlsExpiry,
        });
        if (
          !automated.some(
            (row) =>
              row.name === 'build commit' &&
              row.status === 'PASS' &&
              row.detail === deployedCommit,
          )
        )
          deployedCommit = null;
        const after = await fetchImpl(new URL('/healthz', url), {
          redirect: 'manual',
        });
        const end = await after.json();
        if (
          after.status !== 200 ||
          end.status !== 'ok' ||
          end.commit !== deployedCommit
        )
          deployedCommit = null;
      } catch {
        automated = [{ gate: 'BL-01', status: 'FAIL' }];
      }
    }
    const report = evaluateReadiness(manifest, {
      candidateCommit: args['--candidate'],
      environment: args['--environment'],
      operatingConfig: args['--config'],
      origin: args['--origin'] ?? null,
      automated,
      deployedCommit,
    });
    if (args['--json']) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(
        `${report.environment} candidate ${report.candidateCommit}\nObserved ${report.observedAt}; deployed ${report.deployedCommit ?? 'UNVERIFIED'}; config ${report.operatingConfig}`,
      );
      for (const gate of report.gates)
        console.log(`${gate.result.padEnd(14)} ${gate.id} ${gate.reason}`);
      console.log(
        `Eligible for pilot review: ${report.eligibleForPilotReview ? 'YES' : 'NO'}; BL-13 post-pilot and BL-16 broader announcement remain separate.`,
      );
    }
    return report.eligibleForPilotReview ? 0 : 1;
  } catch {
    console.error(
      'INVALID_INPUT: readiness evidence or arguments rejected; private content omitted.',
    );
    return 2;
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exitCode = await main(process.argv.slice(2));

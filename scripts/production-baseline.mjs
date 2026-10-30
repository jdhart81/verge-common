#!/usr/bin/env node
// Read a reviewed deployment baseline. Never infer it from live health or HEAD.
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL, fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const SHA = /^[a-f0-9]{40}$/;
const RECEIPT =
  /^https:\/\/github\.com\/jdhart81\/verge-common\/blob\/([a-f0-9]{40})\/(docs\/history\/[A-Z0-9_-]+\.md)$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/;
const invalid = () => {
  throw new Error('INVALID_PRODUCTION_BASELINE');
};

export function validateProductionBaseline(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const fields = ['sourceCommit', 'deploymentReceipt', 'qualifiedAt'];
  if (
    Object.keys(value).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(value, field))
  )
    invalid();
  if (typeof value.sourceCommit !== 'string' || !SHA.test(value.sourceCommit))
    invalid();
  if (
    typeof value.deploymentReceipt !== 'string' ||
    !RECEIPT.test(value.deploymentReceipt)
  )
    invalid();
  if (typeof value.qualifiedAt !== 'string' || !STAMP.test(value.qualifiedAt))
    invalid();
  const time = Date.parse(value.qualifiedAt);
  if (
    !Number.isFinite(time) ||
    new Date(time).toISOString().slice(0, 19) !== value.qualifiedAt.slice(0, 19)
  )
    invalid();
  return value;
}

export function verifyBaselineReceipt(value, receipt) {
  validateProductionBaseline(value);
  if (typeof receipt !== 'string') invalid();
  const sources = [
    ...receipt.matchAll(/^\| Reviewed source \| `([a-f0-9]{40})` \|$/gm),
  ];
  const completed = [
    ...receipt.matchAll(/^\*\*Completed [^\n]*\(`([^`]+)`\)\.\*\*/gm),
  ];
  if (
    sources.length !== 1 ||
    completed.length !== 1 ||
    sources[0][1] !== value.sourceCommit ||
    completed[0][1] !== value.qualifiedAt
  )
    invalid();
  return value;
}

export async function loadProductionBaseline(
  path = new URL('../.github/production-baseline.json', import.meta.url),
) {
  try {
    const value = validateProductionBaseline(
      JSON.parse(await readFile(path, 'utf8')),
    );
    // Both revisions must resolve to existing commits. Read the historical
    // receipt at its immutable revision, never a mutable HEAD copy or URL.
    const [, revision, receiptPath] = value.deploymentReceipt.match(RECEIPT);
    for (const commit of [value.sourceCommit, revision]) {
      const { stdout: type } = await exec('git', ['cat-file', '-t', commit], {
        cwd: root,
      });
      if (type.trim() !== 'commit') invalid();
    }
    const { stdout: receipt } = await exec(
      'git',
      ['show', `${revision}:${receiptPath}`],
      { cwd: root, maxBuffer: 1024 * 1024 },
    );
    return verifyBaselineReceipt(value, receipt);
  } catch {
    invalid();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  loadProductionBaseline(process.argv[2]).then(
    (value) => console.log(value.sourceCommit),
    () => {
      console.error('INVALID_PRODUCTION_BASELINE');
      process.exitCode = 1;
    },
  );
}

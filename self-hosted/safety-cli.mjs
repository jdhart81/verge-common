import { readFileSync } from 'node:fs';
import { getDatabase } from './storage.mjs';
import { createSafety } from './safety.mjs';

// Run only on the private host through an existing authorized operator login.
// Decision files keep private notes out of shell history. Never accept URLs.
const safety = createSafety(getDatabase());
const [action, argument] = process.argv.slice(2);
try {
  let result;
  if (action === 'list') result = safety.list(argument ? JSON.parse(readFileSync(argument, 'utf8')) : {});
  else if (action === 'summary') result = safety.summary();
  else if (action === 'show') result = safety.read(argument);
  else if (['resolve', 'release'].includes(action)) {
    if (!argument || argument.includes('://')) throw new Error('Pass a local JSON decision file.');
    result = safety[action](JSON.parse(readFileSync(argument, 'utf8')));
  } else throw new Error('Use list, summary, show REPORT_ID, resolve FILE.json or release FILE.json.');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

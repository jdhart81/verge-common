// Fail closed before restarting a pre-v0.9.0 writer on a live database.
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
const path = resolve(
  process.argv[2] || process.env.VERGE_DATA_DIR || '.verge-data',
  'vergecommon.sqlite',
);
const db = new DatabaseSync(path, { readOnly: true });
try {
  const incompatible = db
    .prepare('SELECT state_json FROM workspaces')
    .all()
    .some((row) => {
      const s = JSON.parse(row.state_json);
      return (
        s.careActions?.length ||
        s.events?.some((e) => e.result) ||
        s.members?.some((m) => m.referralId) ||
        s.operatorRestriction ||
        ['updates', 'comments', 'events'].some((key) =>
          s[key]?.some((item) => item.operatorHidden),
        )
      );
    });
  if (incompatible)
    throw new Error(
      'Pre-v0.9.0 writers cannot protect these new records. Keep current data and ship a compatibility/forward repair; do not restore an older snapshot over live data.',
    );
  console.log(
    JSON.stringify({
      status: 'passed',
      previousWriterCompatible: true,
      productionChanged: false,
    }),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}

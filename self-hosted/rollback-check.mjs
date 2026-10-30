// Fail closed before restarting an older writer on a live database. Each check names the
// first release whose privacy and erasure rules protect those records.
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
const path = resolve(
  process.argv[2] || process.env.VERGE_DATA_DIR || '.verge-data',
  'vergecommon.sqlite',
);
const db = new DatabaseSync(path, { readOnly: true });
try {
  const states = db
    .prepare('SELECT state_json FROM workspaces')
    .all()
    .map((row) => JSON.parse(row.state_json));
  const checks = [
    [
      '0.9.0',
      (s) =>
        s.careActions?.length ||
        s.events?.some((e) => e.result) ||
        s.members?.some((m) => m.referralId) ||
        s.operatorRestriction ||
        ['updates', 'comments', 'events'].some((key) =>
          s[key]?.some((item) => item.operatorHidden),
        ),
    ],
    [
      '0.10.0',
      (s) =>
        s.woodlandLayers?.length ||
        s.treatmentPlans?.length ||
        s.parcels?.some((p) => p.plannedJoinYear != null),
    ],
  ];
  const needed = checks
    .filter(([, present]) => states.some(present))
    .map(([release]) => String(release))
    .at(-1);
  if (needed)
    throw new Error(
      `Writers older than v${needed} cannot protect these records. Keep current data and ship a compatibility/forward repair; do not restore an older snapshot over live data.`,
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

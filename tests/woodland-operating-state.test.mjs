// The live woodland state must read the same in STATUS.md and its receipt,
// and the receipt must keep the warning that the next release carries the flag.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const RECEIPT = "docs/history/WOODLAND_ON_2026-11-05.md";

await test("STATUS.md says woodland is on and links its receipt", async () => {
  const status = await read("STATUS.md");
  assert.ok(status.includes(RECEIPT), "STATUS.md links the woodland receipt");
  assert.ok(
    !/woodland projects off/i.test(status),
    'no stale "woodland projects off"',
  );
  assert.ok(!/Woodland projects are off in production/.test(status));
  assert.match(status, /VERGE_WOODLAND_DFM=1/);
});

await test("woodland receipt records rollback and the release carry-over", async () => {
  const receipt = await read(RECEIPT);
  assert.match(receipt, /914793054eb8e1b0e86a833d30a40db5acb0e204/);
  assert.match(receipt, /rollback 20261105T124321Z/);
  assert.match(receipt, /carries `VERGE_WOODLAND_DFM=1` over/);
});

import { randomUUID } from 'node:crypto';
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DomainError } from '../lib/network.mjs';

const accountIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const objectKeyPattern = /^private\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/;
const deletedLabel = 'Deleted member';
const pick = (record, keys) =>
  Object.fromEntries(
    keys.filter((k) => Object.hasOwn(record, k)).map((k) => [k, record[k]]),
  );
const common = [
  'id',
  'projectId',
  'createdBy',
  'createdAt',
  'reviewedBy',
  'reviewedAt',
];
const rows = (state, key) => state[key] ?? [];
const intersects = (items, set) => items?.some((id) => set.has(id));
const authored = (record, userId) => record.createdBy === userId;

// No legal retention claim is made. These are the pseudonymous structural records
// necessary to avoid changing another member's vote, share or recorded balance.
export const erasureLimitations = Object.freeze([
  'Shared membership, vote and balance structures remain with identity fields removed; deleted contributions no longer qualify as evidence.',
  'Other members may have independently written about you or kept exports. Those copies cannot be identified or recalled automatically; contact support to request review.',
  'Older backups may contain earlier data. Every restore must replay the latest deletion ledger before use.',
]);

export function initializeErasure(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS erasure_tombstones (user_id TEXT PRIMARY KEY, requested_at INTEGER NOT NULL, completed_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS erasure_file_queue (object_key TEXT PRIMARY KEY, requested_at INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS erasure_workspace_owner_insert BEFORE INSERT ON workspaces
      WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.owner_id)
      BEGIN SELECT RAISE(ABORT, 'Account is no longer available'); END;
    CREATE TRIGGER IF NOT EXISTS erasure_workspace_members_insert BEFORE INSERT ON workspaces
      WHEN EXISTS (SELECT 1 FROM erasure_tombstones t WHERE t.user_id=NEW.owner_id
        OR EXISTS (SELECT 1 FROM json_each(NEW.state_json,'$.members') m WHERE json_extract(m.value,'$.userId')=t.user_id))
      BEGIN SELECT RAISE(ABORT, 'Deleted account cannot rejoin a co-op'); END;
    CREATE TRIGGER IF NOT EXISTS erasure_workspace_members_update BEFORE UPDATE ON workspaces
      WHEN EXISTS (SELECT 1 FROM erasure_tombstones t WHERE t.user_id=NEW.owner_id
        OR EXISTS (SELECT 1 FROM json_each(NEW.state_json,'$.members') m WHERE json_extract(m.value,'$.userId')=t.user_id))
      BEGIN SELECT RAISE(ABORT, 'Deleted account cannot rejoin a co-op'); END;
    CREATE TRIGGER IF NOT EXISTS erasure_asset_insert BEFORE INSERT ON assets
      WHEN NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.uploader_id)
        OR EXISTS (SELECT 1 FROM erasure_tombstones WHERE user_id=NEW.uploader_id)
        OR NOT EXISTS (SELECT 1 FROM workspaces w, json_each(w.state_json,'$.members') m
          WHERE w.id=NEW.workspace_id AND w.visibility != 'archived'
          AND json_extract(m.value,'$.userId')=NEW.uploader_id AND json_extract(m.value,'$.status')='active')
      BEGIN SELECT RAISE(ABORT, 'Active membership is required to store evidence'); END;`);
}

/** Pure transform. No names, credentials, file paths or content enter its receipt. */
export function eraseWorkspaceState(
  previous,
  userId,
  now,
  ownedAssetIds = new Set(),
) {
  const s = structuredClone(previous);
  const anonymousId = `erased-${randomUUID()}`;
  const memberIds = new Set(
    rows(s, 'members')
      .filter((m) => m.userId === userId)
      .map((m) => m.id),
  );
  const memberMap = new Map(
    [...memberIds].map((id) => [id, `erased-${randomUUID()}`]),
  );
  const deletedParcelIds = new Set(
    rows(s, 'parcels')
      .filter((p) => authored(p, userId))
      .map((p) => p.id),
  );
  const deletedBoundaryIds = new Set(
    rows(s, 'parcels').flatMap((p) =>
      rows(p, 'boundaries')
        .filter((b) => deletedParcelIds.has(p.id) || authored(b, userId))
        .map((b) => b.id),
    ),
  );
  const deletedEvidenceIds = new Set(
    rows(s, 'evidence')
      .filter((e) => authored(e, userId) || ownedAssetIds.has(e.asset?.id))
      .map((e) => e.id),
  );
  const ownPostIds = new Set(
    rows(s, 'updates')
      .filter((r) => authored(r, userId))
      .map((r) => r.id),
  );
  const ownCommentIds = new Set(
    rows(s, 'comments')
      .filter((r) => authored(r, userId))
      .map((r) => r.id),
  );
  const ownEventIds = new Set(
    rows(s, 'events')
      .filter((r) => authored(r, userId) || r.updatedBy === userId)
      .map((r) => r.id),
  );
  const privateAsset = (r) => ownedAssetIds.has(r.asset?.id);
  const affectedLand = (r) =>
    deletedParcelIds.has(r.parcelId) ||
    deletedBoundaryIds.has(r.boundaryId) ||
    intersects(r.parcelIds, deletedParcelIds) ||
    rows(r, 'parcelSnapshot').some(
      (p) =>
        deletedParcelIds.has(p.parcelId) ||
        deletedBoundaryIds.has(p.boundaryId),
    );
  const lastActor = (action) =>
    rows(s, 'audit')
      .filter((a) => a.action === action)
      .at(-1)?.actorId;
  const hasLegacyCancellation = rows(s, 'audit').some(
    (a) => a.action === 'cancel_event' && a.actorId === userId,
  );
  const initialAuthor =
    rows(s, 'audit').find((a) => a.action === 'transfer_stewardship')
      ?.actorId ?? s.ownerId;
  // Legacy co-op metadata and invitations predate explicit author columns.
  if (
    lastActor('update_coop') === userId ||
    (!lastActor('update_coop') && initialAuthor === userId)
  ) {
    s.name = 'Community co-op';
    s.region = '';
    s.summary = '';
  }
  if (lastActor('update_organization') === userId) s.organization = null;
  if (
    lastActor('update_regional_settings') === userId ||
    (!lastActor('update_regional_settings') && initialAuthor === userId)
  )
    s.country = '';
  const ownInvitationIds = new Set(
    rows(s, 'audit')
      .filter((a) => a.actorId === userId && a.action === 'create_invitation')
      .map((a) => a.id),
  );
  s.invitations = rows(s, 'invitations').filter(
    (i) =>
      i.usedBy !== userId &&
      !ownInvitationIds.has(i.id) &&
      i.createdBy !== userId,
  );
  s.blocks = rows(s, 'blocks').filter(
    (b) => b.userId !== userId && b.blockedUserId !== userId,
  );
  s.members = rows(s, 'members').map((m) =>
    m.userId === userId
      ? {
          id: memberMap.get(m.id),
          userId: anonymousId,
          name: deletedLabel,
          role: 'member',
          status: 'removed',
          joinedAt: m.joinedAt,
        }
      : m,
  );
  if (s.ownerId === userId) {
    s.ownerId = anonymousId;
    s.visibility = 'archived';
  }
  s.projects = rows(s, 'projects').map((p) =>
    authored(p, userId)
      ? {
          ...pick(p, [...common, 'kind']),
          name: 'Deleted contribution',
          summary: '',
          region: '',
          status: 'cancelled',
          visibility: 'members',
          erasureRedacted: true,
        }
      : p,
  );
  // Tombstone parent posts retain other people's replies without republishing them.
  s.updates = rows(s, 'updates').map((p) =>
    authored(p, userId)
      ? {
          ...pick(p, common),
          text: '',
          author: deletedLabel,
          visibility: 'members',
          hidden: true,
        }
      : p,
  );
  s.comments = rows(s, 'comments').filter((r) => !authored(r, userId));
  s.events = rows(s, 'events').map((e) => ({
    ...(authored(e, userId) || e.updatedBy === userId
      ? {
          ...pick(e, [...common, 'startsAt', 'endsAt', 'capacity']),
          title: 'Deleted event',
          summary: '',
          meetingDetails: '',
          timeZone: 'UTC',
          visibility: 'members',
          status: 'cancelled',
          hidden: true,
          calendarSequence: (e.calendarSequence ?? 0) + 1,
          cancelledAt: now,
        }
      : e),
    rsvps: rows(e, 'rsvps').filter((r) => r.userId !== userId),
  }));
  if (hasLegacyCancellation) {
    for (const event of s.events)
      if (!event.cancelledBy) delete event.cancelReason;
  }
  s.reports = rows(s, 'reports').filter(
    (r) =>
      !authored(r, userId) &&
      !ownPostIds.has(r.targetId) &&
      !ownCommentIds.has(r.targetId) &&
      !ownEventIds.has(r.targetId),
  );
  s.tasks = rows(s, 'tasks').map((t) => {
    let task = authored(t, userId)
      ? {
          ...pick(t, [...common, 'status', 'assignee', 'completedAt']),
          title: 'Deleted contribution',
          due: '',
        }
      : t;
    if (task.assignee === userId)
      task = { ...task, assignee: null, status: 'open', completedAt: null };
    return task;
  });
  s.parcels = rows(s, 'parcels')
    .filter((p) => !deletedParcelIds.has(p.id))
    .map((p) => ({
      ...p,
      boundaries: rows(p, 'boundaries').filter(
        (b) => !deletedBoundaryIds.has(b.id),
      ),
      consents: rows(p, 'consents').filter(
        (c) =>
          !authored(c, userId) &&
          !deletedBoundaryIds.has(c.landSnapshot?.boundaryId),
      ),
    }));
  for (const key of [
    'satelliteSearches',
    'observations',
    'analysisJobs',
    'analysisResults',
  ]) {
    s[key] = rows(s, key).filter(
      (r) => !authored(r, userId) && !affectedLand(r),
    );
  }
  const jobIds = new Set(s.analysisJobs.map((j) => j.id));
  s.analysisResults = s.analysisResults.filter((r) => jobIds.has(r.jobId));
  s.evidence = rows(s, 'evidence').filter((e) => !deletedEvidenceIds.has(e.id));
  s.partnerships = rows(s, 'partnerships')
    .filter(
      (p) => !authored(p, userId) && !deletedEvidenceIds.has(p.evidenceId),
    )
    .map((p) => ({
      ...p,
      participation: (p.participation ?? [])
        .filter(
          (invitation) =>
            !memberIds.has(invitation.memberId) &&
            invitation.invitedBy !== userId &&
            invitation.respondedBy !== userId &&
            invitation.endedBy !== userId,
        )
        .map((invitation) => {
          if (
            invitation.reviewedBy !== userId &&
            !deletedEvidenceIds.has(invitation.authorityEvidenceId)
          )
            return invitation;
          const {
            reviewedBy: _reviewer,
            reviewedAt: _reviewedAt,
            reviewNote: _note,
            authorityEvidenceId: _evidence,
            ...clean
          } = invitation;
          return {
            ...clean,
            status:
              invitation.status === 'reviewed' ? 'accepted' : invitation.status,
          };
        }),
    }));
  s.assessments = rows(s, 'assessments').filter(
    (a) => !authored(a, userId) && !affectedLand(a),
  );
  s.agreements = rows(s, 'agreements').filter(
    (a) => !authored(a, userId) && !affectedLand(a),
  );
  if (
    s.authority &&
    (authored(s.authority, userId) ||
      deletedEvidenceIds.has(s.authority.evidenceId))
  )
    s.authority = null;
  s.proposals = rows(s, 'proposals').map((p) =>
    authored(p, userId)
      ? {
          ...pick(p, [
            ...common,
            'shares',
            'stewardshipBps',
            'treasuryBps',
            'electorate',
            'quorum',
            'closesAt',
            'status',
            'votes',
            'closedAt',
          ]),
          title: 'Deleted proposal text',
          text: '',
          erasureRedacted: true,
        }
      : p,
  );

  let financialRedacted = false;
  const redactFinancial = (record, keys, extra = {}) => {
    financialRedacted = true;
    return {
      ...pick(record, [...common, ...keys]),
      ...extra,
      erasureRedacted: true,
    };
  };
  s.lots = rows(s, 'lots').map((l) =>
    authored(l, userId) || deletedEvidenceIds.has(l.evidenceId)
      ? redactFinancial(
          l,
          ['serialStart', 'serialEnd', 'units', 'unit', 'status'],
          {
            registry: 'deleted',
            program: 'deleted',
            serialPrefix: `erased-${l.id}`,
            vintage: '',
            method: '',
            reference: '',
            evidenceId: null,
          },
        )
      : l,
  );
  s.settlements = rows(s, 'settlements').map((r) =>
    authored(r, userId) || deletedEvidenceIds.has(r.evidenceId)
      ? redactFinancial(r, ['lotId', 'units', 'cents', 'currency', 'status'], {
          reference: '',
          evidenceId: null,
        })
      : r,
  );
  s.allocations = rows(s, 'allocations').map((a) => {
    const allocation = authored(a, userId)
      ? redactFinancial(a, [
          'settlementId',
          'charterId',
          'amounts',
          'status',
          'approvedBy',
        ])
      : a;
    allocation.payments = rows(a, 'payments').map((p) =>
      authored(p, userId) ||
      memberIds.has(p.memberId) ||
      deletedEvidenceIds.has(p.evidenceId)
        ? redactFinancial(p, ['memberId', 'cents', 'status'], {
            reference: '',
            evidenceId: null,
          })
        : p,
    );
    allocation.disbursements = rows(a, 'disbursements').map((receipt) =>
      authored(receipt, userId) || deletedEvidenceIds.has(receipt.evidenceId)
        ? redactFinancial(receipt, ['budget', 'cents', 'status'], {
            recipientLabel: deletedLabel,
            purpose: '',
            reference: '',
            evidenceId: null,
          })
        : receipt,
    );
    return allocation;
  });
  s.retirements = rows(s, 'retirements').map((r) =>
    authored(r, userId) || deletedEvidenceIds.has(r.evidenceId)
      ? redactFinancial(r, ['settlementId', 'units', 'status'], {
          beneficiary: deletedLabel,
          reference: '',
          evidenceId: null,
        })
      : r,
  );
  if (financialRedacted) s.financialRecordsRedactedAt = now;

  function scrub(value) {
    if (typeof value === 'string')
      return value === userId ? anonymousId : (memberMap.get(value) ?? value);
    if (Array.isArray(value)) return value.map(scrub);
    if (!value || typeof value !== 'object') return value;
    const result = { ...value };
    if (memberIds.has(result.id) || memberIds.has(result.memberId)) {
      if (Object.hasOwn(result, 'name')) result.name = deletedLabel;
    }
    if (result.reviewedBy === userId) {
      delete result.reviewNote;
      // Agreement execution text is supplied by its reviewer.
      if (Object.hasOwn(result, 'executionReference')) {
        result.executionReference = '';
        result.recordingReference = '';
        result.status = 'revoked';
      }
      if (Object.hasOwn(result, 'note')) delete result.note;
    }
    if (result.revokedBy === userId) delete result.revocationReason;
    if (result.withdrawnBy === userId) delete result.withdrawalReason;
    if (result.cancelledBy === userId) delete result.cancelReason;
    if (privateAsset(result)) delete result.asset;
    return Object.fromEntries(
      Object.entries(result).map(([key, item]) => [key, scrub(item)]),
    );
  }
  // Hash commitments are over pre-erasure content and cannot truthfully describe
  // the sanitized state. Keep other people's request hashes for retry safety.
  s.audit = rows(s, 'audit').map((event) => {
    const clean = pick(event, ['id', 'sequence', 'action', 'actorId', 'at']);
    if (event.actorId !== userId && event.requestHash)
      clean.requestHash = event.requestHash;
    return clean;
  });
  s.erasure = { lastCompletedAt: now, auditCommitmentsReset: true };
  s.updatedAt = now;
  return { state: scrub(s), financialRedacted };
}

function readLedgerIntent(path, expectedId) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024)
    throw new Error('Unsafe deletion ledger entry');
  const entry = JSON.parse(readFileSync(path, 'utf8'));
  if (
    entry.schema !== 1 ||
    entry.userId !== expectedId ||
    !accountIdPattern.test(entry.userId) ||
    !Number.isSafeInteger(entry.requestedAt) ||
    entry.requestedAt < 0 ||
    Object.keys(entry).sort().join(',') !== 'requestedAt,schema,userId'
  )
    throw new Error('Invalid deletion ledger entry');
  return entry;
}

function recordIntent(directory, userId, requestedAt) {
  const root = resolve(directory);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('Deletion ledger must be a real directory');
  const committed = join(root, `${userId}.json`);
  if (existsSync(committed)) return readLedgerIntent(committed, userId);
  const path = join(root, `${userId}.pending`);
  let file;
  try {
    file = openSync(path, 'wx', 0o600);
    writeFileSync(
      file,
      JSON.stringify({ schema: 1, userId, requestedAt }) + '\n',
    );
    fsyncSync(file);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return readLedgerIntent(path, userId);
  } finally {
    if (file !== undefined) closeSync(file);
  }
  const dir = openSync(root, 'r');
  try {
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
  return { schema: 1, userId, requestedAt };
}

function syncDirectory(directory) {
  const dir = openSync(resolve(directory), 'r');
  try {
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
}

/** Call only AFTER the outer SQLite COMMIT has succeeded. */
export function commitErasureIntent(ledgerDirectory, userId) {
  if (!accountIdPattern.test(userId))
    throw new Error('Invalid erasure identity');
  const root = resolve(ledgerDirectory);
  const pending = join(root, `${userId}.pending`);
  const committed = join(root, `${userId}.json`);
  if (existsSync(committed)) {
    readLedgerIntent(committed, userId);
    if (existsSync(pending)) {
      readLedgerIntent(pending, userId);
      unlinkSync(pending);
      syncDirectory(root);
    }
    return;
  }
  readLedgerIntent(pending, userId);
  renameSync(pending, committed);
  syncDirectory(root);
}

/** Call after ROLLBACK; a failed transaction must not become a future deletion. */
export function abortErasureIntent(ledgerDirectory, userId) {
  if (!accountIdPattern.test(userId))
    throw new Error('Invalid erasure identity');
  try {
    unlinkSync(join(resolve(ledgerDirectory), `${userId}.pending`));
    syncDirectory(ledgerDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

/** Startup-only reconciliation against the authoritative LIVE database, with no concurrent writes. */
export function recoverErasureIntents(db, ledgerDirectory) {
  const root = resolve(ledgerDirectory);
  initializeErasure(db);
  if (
    !existsSync(root) &&
    db.prepare('SELECT count(*) AS n FROM erasure_tombstones').get().n
  )
    throw new Error(
      'Deletion ledger is missing for committed account deletions; recover the latest ledger before serving',
    );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error('A real deletion ledger directory is required');
  let committed = 0,
    discarded = 0;
  for (const name of readdirSync(root).filter((n) => n.endsWith('.pending'))) {
    const userId = name.slice(0, -8);
    readLedgerIntent(join(root, name), userId);
    if (
      db
        .prepare('SELECT user_id FROM erasure_tombstones WHERE user_id=?')
        .get(userId)
    ) {
      commitErasureIntent(root, userId);
      committed++;
    } else {
      abortErasureIntent(root, userId);
      discarded++;
    }
  }
  for (const row of db
    .prepare('SELECT user_id FROM erasure_tombstones')
    .all()) {
    const path = join(root, `${row.user_id}.json`);
    if (!existsSync(path))
      throw new Error(
        'Deletion ledger is incomplete for committed account deletions',
      );
    readLedgerIntent(path, row.user_id);
  }
  return { committed, discarded };
}

/**
 * Verify the password BEFORE calling. This synchronous operation uses a
 * savepoint so the caller can delete credentials in the SAME outer transaction.
 * Finalize its prepared ledger entry with commitErasureIntent AFTER the outer
 * COMMIT, or discard with abortErasureIntent after ROLLBACK. Startup reconciles
 * a crash between DB commit and the durable ledger marker.
 */
export function eraseAccountData(
  db,
  userId,
  now = Date.now(),
  { ledgerDirectory, replay = false } = {},
) {
  if (!accountIdPattern.test(userId) || !Number.isSafeInteger(now) || now < 0)
    throw new Error('Invalid erasure identity or time');
  if (!ledgerDirectory)
    throw new Error('A durable deletion ledger is required');
  initializeErasure(db);
  db.exec('SAVEPOINT account_erasure');
  try {
    const plans = [];
    const assets = db
      .prepare('SELECT id,workspace_id,uploader_id,object_key FROM assets')
      .all();
    const ownedAssetIds = new Set(
      assets.filter((a) => a.uploader_id === userId).map((a) => a.id),
    );
    for (const row of db.prepare('SELECT * FROM workspaces').all()) {
      const state = JSON.parse(row.state_json);
      if (
        state.id !== row.id ||
        state.ownerId !== row.owner_id ||
        !Array.isArray(state.members) ||
        !Array.isArray(state.audit)
      )
        throw new Error(
          'Workspace is inconsistent; deletion paused without changing data',
        );
      const hasOwnedAsset = assets.some(
        (a) =>
          ownedAssetIds.has(a.id) &&
          (a.workspace_id === row.id || row.state_json.includes(a.id)),
      );
      if (!row.state_json.includes(userId) && !hasOwnedAsset) continue;
      const otherMembers = state.members.filter((m) => m.userId !== userId);
      if (
        !replay &&
        state.ownerId === userId &&
        state.visibility !== 'archived' &&
        otherMembers.some((m) => m.status === 'active')
      )
        throw new DomainError(
          'Transfer founding stewardship to another active steward, or archive the co-op, before deleting your account. Open Co-op settings to complete the handover.',
          409,
        );
      if (state.ownerId === userId && !otherMembers.length)
        plans.push({ row, remove: true });
      else
        plans.push({
          row,
          ...eraseWorkspaceState(state, userId, now, ownedAssetIds),
        });
    }
    const removedWorkspaces = new Set(
      plans.filter((p) => p.remove).map((p) => p.row.id),
    );
    const removedAssets = assets.filter(
      (a) => a.uploader_id === userId || removedWorkspaces.has(a.workspace_id),
    );
    for (const asset of removedAssets)
      if (
        !objectKeyPattern.test(asset.object_key) ||
        asset.object_key !== `private/${asset.workspace_id}/${asset.id}`
      )
        throw new Error(
          'Unsafe evidence object key; deletion paused without changing data',
        );
    // Prepared entries cannot cause a restore to delete an uncommitted account.
    const intent = recordIntent(ledgerDirectory, userId, now);
    for (const p of plans) {
      if (p.remove)
        db.prepare('DELETE FROM workspaces WHERE id=?').run(p.row.id);
      else
        db.prepare(
          'UPDATE workspaces SET state_json=?,owner_id=?,name=?,region=?,summary=?,visibility=?,version=version+1,updated_at=? WHERE id=?',
        ).run(
          JSON.stringify(p.state),
          p.state.ownerId,
          p.state.name,
          p.state.region,
          p.state.summary,
          p.state.visibility,
          now,
          p.row.id,
        );
    }
    for (const asset of removedAssets) {
      db.prepare('INSERT OR IGNORE INTO erasure_file_queue VALUES (?,?)').run(
        asset.object_key,
        now,
      );
      db.prepare('DELETE FROM assets WHERE id=?').run(asset.id);
    }
    db.prepare('DELETE FROM auth_audit WHERE user_id=?').run(userId);
    db.prepare(
      'INSERT INTO erasure_tombstones VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET completed_at=excluded.completed_at',
    ).run(userId, intent.requestedAt, now);
    db.exec('RELEASE account_erasure');
    return {
      removedWorkspaces: removedWorkspaces.size,
      sanitizedWorkspaces: plans.length - removedWorkspaces.size,
      removedAssets: removedAssets.length,
      financialWorkspacesRestricted: plans.filter((p) => p.financialRedacted)
        .length,
      retainedMetadata: [
        'Opaque deletion-ledger account ID and timestamps',
        'Shared membership and governance structures with identity fields removed',
        'Shared financial numbers and statuses, where present',
      ],
      limitations: [...erasureLimitations],
    };
  } catch (error) {
    db.exec('ROLLBACK TO account_erasure; RELEASE account_erasure');
    throw error;
  }
}

export async function drainErasureFiles(db, store) {
  initializeErasure(db);
  let deletedFiles = 0;
  for (const row of db
    .prepare('SELECT object_key FROM erasure_file_queue')
    .all()) {
    if (!objectKeyPattern.test(row.object_key))
      throw new Error('Unsafe queued evidence key');
    await store.delete(row.object_key);
    db.prepare('DELETE FROM erasure_file_queue WHERE object_key=?').run(
      row.object_key,
    );
    deletedFiles++;
  }
  return {
    deletedFiles,
    pendingFiles: db
      .prepare('SELECT count(*) AS n FROM erasure_file_queue')
      .get().n,
  };
}

export function replayErasureLedger(db, { ledgerDirectory, now = Date.now() }) {
  const root = resolve(ledgerDirectory);
  if (!lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink())
    throw new Error('A current, real deletion ledger directory is required');
  const entries = readdirSync(root)
    .sort()
    .map((name) => {
      const id = name.endsWith('.json') ? name.slice(0, -5) : '';
      if (!accountIdPattern.test(id))
        throw new Error('Unexpected deletion ledger entry');
      return readLedgerIntent(join(root, name), id);
    });
  initializeErasure(db);
  const committedIds = new Set(entries.map((entry) => entry.userId));
  if (
    db
      .prepare('SELECT user_id FROM erasure_tombstones')
      .all()
      .some((row) => !committedIds.has(row.user_id))
  )
    throw new Error(
      'Deletion ledger is incomplete for committed account deletions',
    );
  let replayedAccounts = 0;
  for (const entry of entries) {
    const applied = db
      .prepare('SELECT user_id FROM erasure_tombstones WHERE user_id=?')
      .get(entry.userId);
    // A crash may have committed data erasure but not credential closure.
    const exists = db
      .prepare('SELECT id FROM users WHERE id=?')
      .get(entry.userId);
    if (applied && !exists) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      eraseAccountData(db, entry.userId, now, {
        ledgerDirectory: root,
        replay: true,
      });
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(entry.userId);
      db.prepare('DELETE FROM api_tokens WHERE user_id=?').run(entry.userId);
      db.prepare('DELETE FROM users WHERE id=?').run(entry.userId);
      db.exec('COMMIT');
      replayedAccounts++;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { ledgerEntries: entries.length, replayedAccounts };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const args = process.argv.slice(2);
    if (
      args.length !== 5 ||
      args[0] !== '--replay' ||
      args[1] !== '--data' ||
      args[3] !== '--ledger'
    )
      throw new Error(
        'Usage: node self-hosted/erasure.mjs --replay --data /isolated/restored-data --ledger /latest/deletion-ledger',
      );
    const { openDatabase, objectStore } = await import('./storage.mjs');
    const databasePath = join(resolve(args[2]), 'vergecommon.sqlite');
    if (!existsSync(databasePath))
      throw new Error('Restore data must already contain a database');
    const db = openDatabase(databasePath);
    try {
      db.exec('PRAGMA secure_delete=ON');
      const result = replayErasureLedger(db, {
        ledgerDirectory: resolve(args[4]),
      });
      const files = await drainErasureFiles(
        db,
        objectStore(join(resolve(args[2]), 'evidence')),
      );
      db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
      console.log(JSON.stringify({ status: 'passed', ...result, ...files }));
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(`Erasure replay failed: ${error.message}`);
    process.exitCode = 1;
  }
}

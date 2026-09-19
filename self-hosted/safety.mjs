import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { membership, publicWorkspace } from '../lib/network.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const secret = /^[a-f0-9]{64}$/;
const kinds = ['general', 'coop', 'project', 'update', 'comment', 'event'];
const collections = { project: 'projects', update: 'updates', comment: 'comments', event: 'events' };
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const safeEqual = (a, b) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** Operator-only queue. No queue or resolution endpoint is exposed over HTTP. */
export function createSafety(db, now = Date.now) {
  db.exec(`CREATE TABLE IF NOT EXISTS safety_reports (
    id TEXT PRIMARY KEY, receipt_hash TEXT NOT NULL, payload_hash TEXT NOT NULL,
    reporter_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, coop_id TEXT, target_id TEXT, category TEXT NOT NULL,
    reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'received',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS safety_reports_status ON safety_reports(status, created_at);
    CREATE TABLE IF NOT EXISTS safety_actions (
    id TEXT PRIMARY KEY, report_id TEXT, action TEXT NOT NULL, operator TEXT NOT NULL,
    note TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS safety_deleted_reporter BEFORE INSERT ON safety_reports
    WHEN NEW.reporter_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users WHERE id=NEW.reporter_id)
    BEGIN SELECT RAISE(ABORT, 'Account is no longer available'); END;`);

  const lookup = (id, receipt) => {
    if (!uuid.test(id ?? '') || !secret.test(receipt ?? '')) fail('Report receipt not found.', 404);
    const row = db.prepare('SELECT * FROM safety_reports WHERE id=?').get(id);
    if (!row || !safeEqual(row.receipt_hash, hash(receipt))) fail('Report receipt not found.', 404);
    return row;
  };
  const visibleStatus = (row) => ({ id: row.id, status: row.status, updatedAt: row.updated_at });
  return {
    submit(input, principal) {
      if (!uuid.test(input.requestId ?? '') || !secret.test(input.receipt ?? '')) fail('A private report receipt is required.');
      if (!kinds.includes(input.kind) || !['abuse', 'privacy', 'access', 'other'].includes(input.category)) fail('Choose a report category and item.');
      if (typeof input.reason !== 'string' || input.reason.trim().length < 20 || input.reason.length > 4000) fail('Describe the concern in 20–4,000 characters.');
      const reason = input.reason.trim();
      const coopId = input.kind === 'general' ? null : input.coopId;
      const targetId = input.kind === 'general' ? null : input.kind === 'coop' ? coopId : input.targetId;
      if (input.kind !== 'general' && (!uuid.test(coopId ?? '') || !uuid.test(targetId ?? ''))) fail('Choose an available co-op or item.');
      const payloadHash = hash(JSON.stringify({ kind: input.kind, coopId, targetId, category: input.category, reason, reporter: principal?.id ?? null }));
      const previous = db.prepare('SELECT * FROM safety_reports WHERE id=?').get(input.requestId);
      if (previous) {
        lookup(input.requestId, input.receipt);
        if (previous.payload_hash !== payloadHash) fail('This receipt belongs to an earlier report. Start a new report for changed details.', 409);
        return { ...visibleStatus(previous), receipt: input.receipt, repeated: true };
      }
      if (coopId) {
        const row = db.prepare('SELECT state_json,visibility FROM workspaces WHERE id=?').get(coopId);
        if (!row) fail('That item is unavailable. Use a general report instead.', 404);
        const state = JSON.parse(row.state_json);
        const member = principal && membership(state, principal.id);
        if (!member && row.visibility !== 'public') fail('That item is unavailable. Use a general report instead.', 404);
        const view = member ? state : publicWorkspace(state);
        if (input.kind !== 'coop' && !(view[collections[input.kind]] ?? []).some((item) => item.id === targetId)) fail('That item is unavailable. Use a general report instead.', 404);
      }
      if (db.prepare("SELECT count(*) AS n FROM safety_reports WHERE status IN ('received','reviewing')").get().n >= 2000) fail('The report queue needs operator attention. Contact justin@viridisconservation.com.', 503);
      const time = now();
      db.prepare('INSERT INTO safety_reports (id,receipt_hash,payload_hash,reporter_id,kind,coop_id,target_id,category,reason,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(input.requestId, hash(input.receipt), payloadHash, principal?.id ?? null, input.kind, coopId, targetId, input.category, reason, time, time);
      return { id: input.requestId, receipt: input.receipt, status: 'received', updatedAt: time, repeated: false };
    },
    status(input) { return visibleStatus(lookup(input.id, input.receipt)); },
    list({ after = 0, afterId = '', limit = 100, status = 'open' } = {}) {
      if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200 ||
        (afterId !== '' && !uuid.test(afterId)) || !['open', 'all'].includes(status)) fail('Use a valid report queue cursor.');
      const reports = db.prepare(`SELECT id,kind,coop_id,target_id,category,status,created_at,updated_at FROM safety_reports
        WHERE (?='all' OR status IN ('received','reviewing')) AND (created_at > ? OR (created_at = ? AND id > ?))
        ORDER BY created_at,id LIMIT ?`).all(status, after, after, afterId, limit + 1);
      const last = reports[Math.min(limit, reports.length) - 1];
      return { reports: reports.slice(0, limit), next: reports.length > limit ? { after: last.created_at, afterId: last.id, limit, status } : null };
    },
    export(userId) {
      return db.prepare('SELECT id,kind,coop_id,target_id,category,reason,status,created_at,updated_at FROM safety_reports WHERE reporter_id=? ORDER BY created_at,id').all(userId);
    },
    read(id) {
      const row = db.prepare('SELECT id,kind,coop_id,target_id,category,reason,status,created_at,updated_at FROM safety_reports WHERE id=?').get(id);
      if (!row) fail('Report not found.', 404);
      return row;
    },
    summary() {
      return db.prepare("SELECT count(*) AS openReports, min(created_at) AS oldestOpenAt FROM safety_reports WHERE status IN ('received','reviewing')").get();
    },
    resolve({ id, action, operator, note }) {
      if (!['review', 'hide', 'restrict', 'dismiss'].includes(action)) fail('Choose review, hide, restrict or dismiss.');
      if (typeof operator !== 'string' || !operator.trim() || operator.length > 120 || typeof note !== 'string' || note.trim().length < 10 || note.length > 1000) fail('Record the operator and a short decision rationale.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = this.read(id);
        if (!['received', 'reviewing'].includes(row.status)) fail('This report is already resolved.', 409);
        if (['hide', 'restrict'].includes(action)) {
          if (!row.coop_id) fail('A general report cannot directly change community records.');
          const workspace = db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(row.coop_id);
          if (!workspace) fail('The co-op is no longer available.');
          const state = JSON.parse(workspace.state_json);
          if (action === 'restrict') {
            // Owner edits cannot undo operator restriction; a separate explicit
            // operator review must lift it. Membership/privacy stays intact.
            state.operatorRestriction = { reportId: id, restrictedAt: now() };
            state.visibility = state.visibility === 'archived' ? 'archived' : 'private';
          } else {
            const collection = collections[row.kind];
            if (!collection || row.kind === 'project') fail('Use restrict for a co-op or project concern.');
            const target = (state[collection] ?? []).find((item) => item.id === row.target_id);
            if (!target) fail('The reported item is no longer available.');
            target.hidden = true;
            target.operatorHidden = true;
          }
          state.updatedAt = now();
          db.prepare('UPDATE workspaces SET state_json=?,visibility=?,updated_at=?,version=version+1 WHERE id=?')
            .run(JSON.stringify(state), state.visibility, state.updatedAt, row.coop_id);
        }
        const status = action === 'review' ? 'reviewing' : action === 'dismiss' ? 'closed' : 'action_taken';
        db.prepare('UPDATE safety_reports SET status=?,updated_at=? WHERE id=?').run(status, now(), id);
        db.prepare('INSERT INTO safety_actions VALUES (?,?,?,?,?,?)').run(randomUUID(), id, action, operator.trim(), note.trim(), now());
        db.exec('COMMIT');
        return { id, status };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    release({ coopId, operator, note }) {
      if (!uuid.test(coopId ?? '') || typeof operator !== 'string' || !operator.trim() || operator.length > 120 || typeof note !== 'string' || note.trim().length < 10 || note.length > 1000) fail('Record the co-op, operator and reason for lifting the restriction.');
      db.exec('BEGIN IMMEDIATE');
      try {
        const row = db.prepare('SELECT state_json FROM workspaces WHERE id=?').get(coopId);
        if (!row) fail('Co-op not found.');
        const state = JSON.parse(row.state_json);
        if (!state.operatorRestriction) fail('No operator restriction is active.');
        const reportId = state.operatorRestriction.reportId;
        delete state.operatorRestriction;
        // Keep private. Only its steward decides whether to republish.
        state.updatedAt = now();
        db.prepare('UPDATE workspaces SET state_json=?,updated_at=?,version=version+1 WHERE id=?').run(JSON.stringify(state), state.updatedAt, coopId);
        db.prepare('INSERT INTO safety_actions VALUES (?,?,?,?,?,?)').run(randomUUID(), reportId, 'release', operator.trim(), note.trim(), now());
        db.exec('COMMIT');
        return { coopId, released: true };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}

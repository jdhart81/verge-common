import { getD1 } from '@/db/d1';
import {
  authenticated,
  body,
  command,
  failure,
  guardOrigin,
  json,
  load,
  memberView,
  membership,
  newWorkspace,
  DomainError,
} from '@/server/workspaces';
import { woodlandEnabled } from '@/lib/woodland-config.mjs';
import { WOODLAND_OPS } from '@/lib/woodland.mjs';
import { submitCheckContext } from '@/server/woodland-analysis.mjs';
export const dynamic = 'force-dynamic';
const features = () => ({ woodland: woodlandEnabled() });
export async function GET(request: Request) {
  try {
    const user = await authenticated();
    const id = new URL(request.url).searchParams.get('id');
    if (id) {
      const { row, state } = await load(id);
      if (membership(state, user.id))
        return json({
          ...memberView(state, user.id),
          version: row.version,
          features: features(),
        });
      const m = state.members.find(
        (x: { userId: string; activity?: string; status: string }) =>
          x.userId === user.id,
      );
      if (m)
        return json({
          membershipStatus: m.status,
          name: state.name,
          activity: m.activity ?? '',
        });
      return json({ error: 'Membership is required.' }, 403);
    }
    const rows = await getD1()
      .prepare(
        "SELECT id,name,region,visibility,version FROM workspaces WHERE EXISTS (SELECT 1 FROM json_each(state_json,'$.members') m WHERE json_extract(m.value,'$.userId') = ?) ORDER BY updated_at DESC LIMIT 100",
      )
      .bind(user.id)
      .all();
    return json({ workspaces: rows.results });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated();
    const data = await body(request);
    if (data.op === 'create') {
      const requestId = data.requestId;
      if (!/^[0-9a-f-]{36}$/.test(requestId ?? ''))
        throw new DomainError('A request ID is required.');
      const existing = await getD1()
        .prepare('SELECT owner_id FROM workspaces WHERE id = ?')
        .bind(requestId)
        .first<{ owner_id: string }>();
      if (existing) {
        if (existing.owner_id !== user.id)
          throw new DomainError('Request conflict.', 409);
        return json({ id: requestId });
      }
      const count = await getD1()
        .prepare('SELECT count(*) AS n FROM workspaces WHERE owner_id = ?')
        .bind(user.id)
        .first<{ n: number }>();
      if ((count?.n ?? 0) >= 20)
        throw new DomainError(
          'You can create up to 20 co-ops in this release.',
        );
      const s = newWorkspace(data.payload, user, Date.now(), requestId);
      await getD1()
        .prepare(
          'INSERT INTO workspaces (id,owner_id,name,region,summary,visibility,state_json,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          s.id,
          user.id,
          s.name,
          s.region,
          s.summary,
          'private',
          JSON.stringify(s),
          0,
          s.createdAt,
          s.updatedAt,
        )
        .run();
      return json({ id: s.id }, 201);
    }
    if (data.op === 'submit_evidence' && data.payload?.assetId) {
      const asset = await getD1()
        .prepare(
          'SELECT id,workspace_id,uploader_id,filename,content_type,sha256,size FROM assets WHERE id = ? AND workspace_id = ? AND uploader_id = ?',
        )
        .bind(data.payload.assetId, data.id, user.id)
        .first<{
          id: string;
          filename: string;
          content_type: string;
          sha256: string;
          size: number;
          uploader_id: string;
        }>();
      if (!asset) throw new DomainError('File not found.', 404);
      data.payload.asset = {
        id: asset.id,
        filename: asset.filename,
        contentType: asset.content_type,
        sha256: asset.sha256,
        size: asset.size,
        uploaderId: asset.uploader_id,
      };
    } else if (data.payload) {
      delete data.payload.asset;
    }
    if (
      [
        'create_invitation',
        'accept_invitation',
        'record_satellite_search',
      ].includes(data.op)
    )
      throw new DomainError('Use the invitation endpoint.');
    if (
      (WOODLAND_OPS.includes(data.op) ||
        (data.op === 'create_project' && data.payload?.kind === 'woodland')) &&
      !woodlandEnabled()
    )
      throw new DomainError(
        'Woodland projects are not enabled on this service.',
        404,
      );
    if (data.op === 'request_membership') {
      const current = await load(data.id);
      data.version = current.row.version;
    }
    // WS7: a plan's corridor check runs in the analysis worker, never on this thread. The
    // command is first applied with the check deferred, so a submission it refuses costs no
    // engine time; the worker's result is used only for exactly the input the command builds.
    // Skipped when the command will not apply: an invalid request ID (refused), a retried
    // request (answered from its receipt) or a stale version (refused).
    let context = {};
    if (data.op === 'submit_treatment_plan') {
      const current = await load(data.id);
      if (
        /^[0-9a-f-]{36}$/.test(data.requestId ?? '') &&
        current.row.version === data.version &&
        !current.state.audit.some(
          (a: { id: string }) => a.id === data.requestId,
        )
      )
        context = await submitCheckContext(current.state, user, data);
    }
    const result = await command(data.id, user, data, data.version, context);
    if (data.op === 'request_membership' || data.op === 'leave')
      return json({ saved: true });
    return json({
      ...memberView(result.state, user.id),
      version: result.version,
      features: features(),
    });
  } catch (e) {
    return failure(e);
  }
}

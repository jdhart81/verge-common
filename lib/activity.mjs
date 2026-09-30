import { publicWorkspace } from './network.mjs';
export const activityPath = (coopId, kind, id) =>
  `/activity/${coopId}/${kind}/${id}/`;
export function publicActivity(state, kind, id) {
  if (
    state.visibility !== 'public' ||
    !['project', 'event', 'update'].includes(kind)
  )
    return null;
  const coop = publicWorkspace(state);
  const record = coop[
    kind === 'project' ? 'projects' : kind === 'event' ? 'events' : 'updates'
  ].find((r) => r.id === id);
  if (!record || record.status === 'cancelled') return null;
  const project =
    kind === 'project'
      ? record
      : coop.projects.find((p) => p.id === record.projectId);
  return {
    coop: { id: coop.id, name: coop.name, region: coop.region },
    kind,
    record,
    project,
    title:
      kind === 'event'
        ? record.title
        : kind === 'project'
          ? record.name
          : `${project.name} · Progress`,
    summary: record.summary ?? record.text,
    path: activityPath(coop.id, kind, id),
  };
}

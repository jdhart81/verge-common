import { load, membership } from '@/server/workspaces';
import { publicActivity } from '@/lib/activity.mjs';
export async function getPublicActivity(
  coopId: string,
  kind: string,
  id: string,
) {
  if (![coopId, id].every((v) => /^[0-9a-f-]{36}$/.test(v))) return null;
  try {
    return publicActivity((await load(coopId)).state, kind, id);
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export async function ownShareSource(coopId: string, userId: string) {
  return membership((await load(coopId)).state, userId)?.id;
}

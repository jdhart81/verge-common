import {
  authenticated,
  body,
  failure,
  guardOrigin,
  json,
  load,
} from '@/server/workspaces';
import { woodlandEnabled } from '@/lib/woodland-config.mjs';
import { woodlandAnalysis } from '@/server/woodland-analysis.mjs';

// Read-only: runs one spine analysis on the current reviewed woodland layers. No state change,
// no audit entry. See docs/WOODLAND.md.
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated();
    const data = await body(request);
    const { state, row } = await load(data.id);
    return json({
      analysis: await woodlandAnalysis(state, user.id, data, {
        enabled: woodlandEnabled(),
      }),
      version: row.version,
    });
  } catch (e) {
    return failure(e);
  }
}

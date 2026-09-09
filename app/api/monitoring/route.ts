import {
  authenticated,
  body,
  guardOrigin,
  load,
  command,
  json,
  failure,
  DomainError,
  memberView,
  membership,
} from '@/server/workspaces';
import { isSteward } from '@/lib/network.mjs';
import { searchWindow, sceneSummaries } from '@/lib/monitoring.mjs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  try {
    guardOrigin(request);
    const user = await authenticated(),
      input = await body(request);
    const { row, state } = await load(input.id);
    if (!membership(state, user.id))
      throw new DomainError('Membership is required.', 403);
    const parcel = state.parcels.find((p: any) => p.id === input.parcelId);
    if (!parcel || (parcel.createdBy !== user.id && !isSteward(state, user.id)))
      throw new DomainError('Parcel not found.', 404);
    const boundary = parcel.boundaries?.at(-1);
    if (
      state.visibility === 'archived' ||
      !boundary ||
      boundary.status !== 'reviewed' ||
      !boundary.externalSearchAllowed
    )
      throw new DomainError(
        'Review the current boundary and record consent for external searches first.',
      );
    if (input.confirmExternal !== true)
      throw new DomainError(
        'Confirm sending this boundary’s bounding box to Copernicus.',
      );
    let interval: string;
    try {
      interval = searchWindow(input.start, input.end);
    } catch (e) {
      throw new DomainError((e as Error).message);
    }
    const last = (state.satelliteSearches ?? [])
      .filter((s: any) => s.parcelId === parcel.id)
      .at(-1);
    if (last && Date.now() - last.createdAt < 60000)
      throw new DomainError(
        'Wait one minute before searching this parcel again.',
        429,
      );
    const query = new URL('https://stac.dataspace.copernicus.eu/v1/search');
    query.search = new URLSearchParams({
      collections: 'sentinel-2-l2a',
      bbox: boundary.bbox.join(','),
      datetime: interval,
      limit: '20',
      sortby: '-datetime',
    }).toString();
    const response = await fetch(query, {
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
      headers: { accept: 'application/geo+json,application/json' },
    });
    if (!response.ok || !response.body)
      throw new DomainError(
        'The satellite catalogue is unavailable. Try again later.',
        502,
      );
    const reader = response.body.getReader();
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2000000) {
        await reader.cancel();
        throw new DomainError(
          'Catalogue response too large. Try a shorter date range.',
          502,
        );
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    let scenes;
    try {
      scenes = sceneSummaries(JSON.parse(new TextDecoder().decode(combined)));
    } catch {
      throw new DomainError(
        'The catalogue returned invalid scene metadata.',
        502,
      );
    }
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', combined)),
      (b) => b.toString(16).padStart(2, '0'),
    ).join('');
    const result = await command(
      input.id,
      user,
      {
        op: 'record_satellite_search',
        requestId: crypto.randomUUID(),
        payload: {
          parcelId: parcel.id,
          boundaryId: boundary.id,
          scenes,
          start: input.start,
          end: input.end,
          bbox: boundary.bbox,
          provider: 'Copernicus Data Space',
          collection: 'sentinel-2-l2a',
          responseSha256: digest,
          connectorVersion: 'stac-discovery-v1',
          limit: 20,
        },
      },
      row.version,
    );
    return json({
      ...memberView(result.state, user.id),
      version: result.version,
    });
  } catch (e) {
    if ((e as Error).name === 'TimeoutError')
      return json(
        { error: 'The satellite catalogue timed out. Please try again.' },
        504,
      );
    return failure(e);
  }
}

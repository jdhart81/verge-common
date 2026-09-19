'use client';
import { useId } from 'react';
import Link from 'next/link';
export type WorkspaceCapacityStatus = {
  level: 'normal' | 'near_limit' | 'safety_only' | 'full';
  growthPaused: boolean;
  safetyReserveAvailable: boolean;
};

export function WorkspaceCapacityBanner({ capacity, coopId }: {
  capacity?: WorkspaceCapacityStatus;
  coopId: string;
}) {
  const heading = useId();
  if (!capacity || capacity.level === 'normal') return null;
  return (
    <section className="notice mt-4" aria-labelledby={heading}>
      <h2 id={heading}>
        {capacity.level === 'full' ? 'This co-op needs storage help' :
          capacity.growthPaused ? 'New activity is paused to protect safety controls' :
            'Your co-op is approaching its beta storage limit'}
      </h2>
      <p>
        {capacity.level === 'full' ?
          'Your existing records are preserved. Workspace changes may be blocked until the operator arranges an archival migration.' :
          capacity.growthPaused ?
            'The remaining space is reserved for reports, blocks, removals, consent withdrawals and other safety changes. This reserve is limited; contact the operator before it fills.' :
            'Ask the operator to plan an archival migration before new activity is paused. Existing records and audit history will be preserved.'}
      </p>
      <p className="small mt-3">
        <Link className="underline" href={`/report/?kind=coop&coop=${encodeURIComponent(coopId)}`}>
          Send a private operator report
        </Link>
        {' · '}
        <Link className="underline" href="/account/">Your account</Link>
        {' — account export and deletion remain separate from this storage limit.'}
      </p>
    </section>
  );
}

'use client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { pendingWork } from '@/lib/pending-work.mjs';
type PendingRecord = { status: string };
type PendingState = {
  visibility: string;
  members: PendingRecord[];
  parcels: (PendingRecord & {
    boundaries?: PendingRecord[];
    consents?: PendingRecord[];
  })[];
  evidence: PendingRecord[];
  agreements: PendingRecord[];
  assessments?: PendingRecord[];
  partnerships?: PendingRecord[];
  authority?: PendingRecord | null;
  reports?: PendingRecord[];
  proposals: (PendingRecord & {
    closesAt: number;
    electorate: string[];
    votes: { memberId: string }[];
  })[];
};
export function PendingWork({
  state,
  steward,
  memberId,
  now,
  onOpenTab,
}: {
  state: PendingState;
  steward: boolean;
  memberId: string;
  now: number;
  onOpenTab: (tab: string) => void;
}) {
  const heading = useId();
  const notices = pendingWork(state, { steward, memberId, now });
  if (!notices.length) return null;
  return (
    <section className="notice mt-4" aria-labelledby={heading}>
      <h2 id={heading}>Keep your co-op moving</h2>
      <p className="small">
        Pending items from the records you can see. Your own submissions need
        another steward’s review.
      </p>
      <ul className="mt-3 space-y-2">
        {notices.map((notice) => (
          <li key={notice.id}>
            <Button variant="outline" onClick={() => onOpenTab(notice.tab)}>
              {notice.count} {notice.label}
            </Button>
          </li>
        ))}
      </ul>
      <p className="small mt-3">
        This list follows the latest workspace refresh. The open page checks for
        changes while visible and online; no email or push notifications are
        sent.
      </p>
    </section>
  );
}

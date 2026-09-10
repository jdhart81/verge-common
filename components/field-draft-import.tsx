'use client';
import { useState } from 'react';
import { parseFieldDraft } from '@/lib/field-draft.mjs';
import { Button } from '@/components/ui/button';
export function FieldDraftImport() {
  const [draft, setDraft] = useState<ReturnType<typeof parseFieldDraft> | null>(null);
  const [message, setMessage] = useState('');
  return <div className="field-draft-import">
    <label>Import an iPhone field draft (optional)
      <input type="file" accept="application/json,.json" onChange={async (event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = ''; setDraft(null); setMessage('');
        if (!file) return;
        try {
          if (file.size > 20_000) throw new Error('Choose a field-draft file smaller than 20 KB.');
          setDraft(parseFieldDraft(JSON.parse(await file.text())));
        } catch (error) { setMessage((error as Error).message); }
      }} />
    </label>
    {draft && <div>
      <p><strong>{draft.place}</strong> · {draft.date}</p>
      <p className="small">Confirm this is the selected parcel. Importing replaces the fields below; it does not submit or approve the observation.</p>
      <Button type="button" variant="outline" onClick={(event) => {
        const form = event.currentTarget.closest('form');
        if (!form) return;
        for (const name of ['date', 'method', 'finding', 'reference'] as const) {
          const control = form.elements.namedItem(name);
          if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) control.value = draft[name];
        }
        setDraft(null); setMessage('Draft loaded. Check the parcel and details, then save for review.');
      }}>Use draft in this form</Button>
    </div>}
    {message && <p className="small" role="status">{message}</p>}
  </div>;
}

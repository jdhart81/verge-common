'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ControlLabel } from '@/components/ui/label';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';

export type ConversationAction = {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  panel: string;
  status: string;
};

export function ConversationJourney({
  actions,
  renderAction,
  busy,
}: {
  actions: ConversationAction[];
  renderAction: (panel: string) => ReactNode;
  busy: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const hadOpenAction = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [visitedPanels, setVisitedPanels] = useState<string[]>([]);
  const authorizationKey = JSON.stringify(
    actions
      .map((action) => [action.id, action.panel])
      .sort(
        ([leftId, leftPanel], [rightId, rightPanel]) =>
          leftId.localeCompare(rightId) || leftPanel.localeCompare(rightPanel),
      ),
  );
  const [previousAuthorization, setPreviousAuthorization] =
    useState(authorizationKey);
  const selected =
    actions.find((action) => action.id === selectedId) ?? actions[0];
  const openAction = actions.find((action) => action.id === openId);
  const authorizedPanels = new Set(actions.map((action) => action.panel));

  if (previousAuthorization !== authorizationKey) {
    // Keep drafts only while their panel remains authorized for this viewer.
    setPreviousAuthorization(authorizationKey);
    setVisitedPanels((current) => {
      const retained = current.filter((panel) => authorizedPanels.has(panel));
      return retained.length === current.length ? current : retained;
    });
    if (openId && !actions.some((action) => action.id === openId)) {
      setOpenId(null);
    }
  }

  useEffect(() => {
    if (openId) heading.current?.focus();
    else if (hadOpenAction.current) trigger.current?.focus();
    hadOpenAction.current = Boolean(openId);
  }, [openId]);

  if (!selected) return null;

  function open() {
    if (busy || openAction || !selected) return;
    setVisitedPanels((current) =>
      current.includes(selected.panel) ? current : [...current, selected.panel],
    );
    setOpenId(selected.id);
  }

  function close() {
    if (busy) return;
    setOpenId(null);
  }

  return (
    <section
      className="network-card mt-6 min-w-0"
      aria-labelledby={`${id}-title`}
    >
      <p className="eyebrow">Move your co-op forward</p>
      <h3 id={`${id}-title`}>{selected.title}</h3>
      <p>{selected.description}</p>
      <p className="small mt-2">{selected.status.replaceAll('_', ' ')}</p>

      <div className="mt-4 flex min-w-0 flex-wrap items-end gap-3">
        {actions.length > 1 && (
          <ControlLabel className="block min-w-0 flex-1 text-sm font-semibold sm:max-w-md">
            Co-op action
            <NativeSelect
              className="mt-2 w-full max-w-full"
              value={selected.id}
              disabled={busy || Boolean(openAction)}
              onChange={(event) => setSelectedId(event.currentTarget.value)}
            >
              {actions.map((action) => (
                <NativeSelectOption key={action.id} value={action.id}>
                  {action.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </ControlLabel>
        )}
        <Button
          ref={trigger}
          type="button"
          className="h-auto min-h-8 max-w-full whitespace-normal py-2"
          disabled={busy || Boolean(openAction)}
          aria-expanded={Boolean(openAction)}
          aria-controls={`${id}-action`}
          onClick={open}
        >
          {openAction ? 'Action open below' : selected.actionLabel}
        </Button>
      </div>

      <p className="small mt-4">
        Private action · only records you can access. Nothing is posted to the
        discussion. Submit each form to save your changes.
      </p>

      <div id={`${id}-action`}>
        {visitedPanels
          .filter((panel) => authorizedPanels.has(panel))
          .map((panel) => {
            const visible = openAction?.panel === panel;
            const panelAction = visible
              ? openAction
              : actions.find((action) => action.panel === panel);
            return (
              <section
                key={panel}
                hidden={!visible}
                className="mt-5 min-w-0 overflow-hidden rounded-lg border"
                aria-labelledby={`${id}-${panel}-heading`}
                aria-busy={busy}
                data-conversation-panel={panel}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                  <div className="min-w-0 flex-1">
                    <h4
                      ref={visible ? heading : undefined}
                      id={`${id}-${panel}-heading`}
                      tabIndex={-1}
                      className="font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
                    >
                      {panelAction?.title}
                    </h4>
                    <p className="small mt-1">
                      Drafts stay here while this conversation remains open.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={close}
                  >
                    {busy ? 'Saving…' : 'Close action'}
                  </Button>
                </div>
                <div className="max-h-[70dvh] min-w-0 overflow-auto overscroll-contain p-4">
                  {renderAction(panel)}
                </div>
              </section>
            );
          })}
      </div>
    </section>
  );
}

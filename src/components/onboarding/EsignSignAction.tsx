'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSignWellEmbed } from '@/lib/esign/embedClient';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { ESIGN_FAILURE_HELPER_TEXT } from '@/lib/onboarding/esign';
import { Button } from '@/components/ui/button';

const CONFIRM_POLL_MS = 3000;
const CONFIRM_POLL_MAX = 10;

type EsignActionState =
  | 'idle'
  | 'opening'
  | 'signing'
  | 'confirming'
  | 'slow-confirming'
  | 'declined'
  | 'failed';

interface Props {
  itemId: string;
  signingUrl: string;
  onRefresh: () => void;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? ''}`,
  };
}

// In-portal SignWell embed. The UI never writes approval state itself — the
// 'completed' event only means the rep finished the signing flow client-side;
// the webhook (server-side, source of truth) is what flips the item to
// approved. This component just shows a confirming note and polls the
// checklist so the approved state appears without a manual refresh.
export function EsignSignAction({ itemId, signingUrl, onRefresh }: Props) {
  const [state, setState] = useState<EsignActionState>('idle');
  const polls = useRef(0);
  const pollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  // Never setState (or schedule a poll tick that would setState) once the
  // sheet has closed and this component has unmounted - the parent's
  // fetchChecklist stays valid, but there's nothing left here to update.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pollTimeout.current) clearTimeout(pollTimeout.current);
    };
  }, []);

  const safeSetState = useCallback((next: EsignActionState | ((current: EsignActionState) => EsignActionState)) => {
    if (mounted.current) setState(next);
  }, []);

  const reportFailure = useCallback(async () => {
    safeSetState('failed');
    try {
      await fetch('/api/portal/onboarding/esign-embed-error', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ itemId }),
      });
    } catch {
      // Best-effort alert only; the UI failure state above is already shown.
    }
  }, [itemId, safeSetState]);

  const beginConfirmPolling = useCallback(() => {
    safeSetState('confirming');
    polls.current = 0;
    const tick = () => {
      polls.current += 1;
      onRefresh(); // Parent refetches the checklist; approval arrives via webhook.
      if (polls.current < CONFIRM_POLL_MAX) {
        pollTimeout.current = setTimeout(tick, CONFIRM_POLL_MS);
      } else {
        // Polling has a ceiling, but the wait doesn't: be honest that we've
        // stopped actively checking rather than leaving "confirming..."
        // displayed forever. Never claims approval - just that it's still
        // coming and nothing further is needed from the candidate.
        safeSetState('slow-confirming');
      }
    };
    pollTimeout.current = setTimeout(tick, CONFIRM_POLL_MS);
  }, [onRefresh, safeSetState]);

  const open = useCallback(async () => {
    safeSetState('opening');
    try {
      const SignWellEmbed = await loadSignWellEmbed();
      const embed = new SignWellEmbed({
        url: signingUrl,
        events: {
          completed: () => beginConfirmPolling(),
          declined: () => safeSetState('declined'),
          closed: () => safeSetState((current) => (current === 'signing' ? 'idle' : current)),
          error: () => {
            void reportFailure();
          },
        },
      });
      safeSetState('signing');
      embed.open();
    } catch {
      void reportFailure();
    }
  }, [signingUrl, beginConfirmPolling, reportFailure, safeSetState]);

  if (state === 'confirming') {
    return (
      <div className="member-line-note">
        Signature received - confirming with the signing service. This completes automatically.
      </div>
    );
  }

  if (state === 'slow-confirming') {
    return (
      <div className="member-line-note">
        Signature received. Confirmation is taking longer than usual - it finishes automatically,
        nothing else is needed from you.
      </div>
    );
  }

  if (state === 'declined') {
    return (
      <div className="member-line-note warn">
        You declined this document. Reach out to your manager if that was a mistake.
      </div>
    );
  }

  if (state === 'failed') {
    return <div className="member-line-note warn">{ESIGN_FAILURE_HELPER_TEXT}</div>;
  }

  return (
    <Button
      type="button"
      onClick={() => void open()}
      disabled={state === 'opening' || state === 'signing'}
      className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
    >
      {state === 'opening' ? 'Opening...' : 'Sign now'}
    </Button>
  );
}

export default EsignSignAction;

import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Dialog } from '../components/Dialog';
import { describeAuthError, type AuthContext, type FriendlyError } from '../lib/auth-errors';
import { localStore } from '../lib/local-progress';
import { withNext } from '../lib/next';
import { completeSignIn, type SignInStep, type SwitchChoice, type SwitchPrompt } from '../lib/signin-flow';

export type CompletionStep = 'token' | SignInStep;

export const STEP_LABELS: Record<CompletionStep, string> = {
  token: 'Signing in…',
  session: 'Signing in…',
  checking: 'Checking this browser’s progress…',
  syncing: 'Saving this browser’s progress to your account…',
  redirecting: 'Signed in. Taking you back…',
};

interface PendingPrompt extends SwitchPrompt {
  resolve: (choice: SwitchChoice) => void;
}

/**
 * Runs the sign-in completion (lib/signin-flow) for a page: busy state, friendly errors,
 * `email_unverified` → /verify, and the account-switch dialog.
 */
export function useSignInCompletion(next: string, context: AuthContext) {
  const navigate = useNavigate();
  const [step, setStep] = useState<CompletionStep | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [prompt, setPrompt] = useState<PendingPrompt | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async (getToken: () => Promise<string>, afterSession?: () => unknown) => {
      if (busy.current) return;
      busy.current = true;
      setError(null);
      setStep('token');
      try {
        const token = await getToken();
        const outcome = await completeSignIn(token, next, {
          storage: localStore(),
          afterSession,
          onStep: setStep,
          confirmSwitch: (info) => new Promise<SwitchChoice>((resolve) => setPrompt({ ...info, resolve })),
        });
        if (outcome.status === 'cancelled') {
          busy.current = false;
          setStep(null);
        }
        // 'done': the page is on its way to `next`; stay busy.
      } catch (failure) {
        busy.current = false;
        setStep(null);
        const friendly = describeAuthError(failure, context);
        if (friendly.action === 'verify') navigate(withNext('/verify', next));
        else if (!friendly.silent) setError(friendly);
      }
    },
    [context, navigate, next],
  );

  const choose = (choice: SwitchChoice) => {
    prompt?.resolve(choice);
    setPrompt(null);
  };

  const dialog = prompt ? <AccountSwitchDialog unsynced={prompt.unsynced} onChoose={choose} /> : null;
  return { step, busy: step !== null, error, setError, run, dialog };
}

export function AccountSwitchDialog({
  unsynced,
  onChoose,
}: {
  unsynced: number;
  onChoose: (choice: SwitchChoice) => void;
}) {
  return (
    <Dialog
      title="This browser has progress from another account"
      onCancel={() => onChoose('cancel')}
      actions={
        <>
          <button type="button" className="btn btn--primary" onClick={() => onChoose('download')}>
            Download it as a file
          </button>
          <button type="button" className="btn" onClick={() => onChoose('discard')}>
            Discard and continue
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => onChoose('cancel')}>
            Cancel sign-in
          </button>
        </>
      }
    >
      <p>
        {unsynced === 1 ? '1 change' : `${unsynced} changes`} in this browser belong to the account that was signed in
        here before and never reached it. They can’t be added to this account.
      </p>
      <p>Download them as a file to keep a copy, or discard them. Either way, they are then removed from this browser.</p>
    </Dialog>
  );
}

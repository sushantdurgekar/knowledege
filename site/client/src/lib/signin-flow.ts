// What happens after the user proves who they are (build-contracts.md §14, spec §4.6 step 6):
//   1. POST /api/auth/session (the server sets the HttpOnly session cookie and the sh_hint cookie)
//   2. this browser's progress belongs to another account (owner tag) and some of it is unsynced:
//      ask [Download it as a file] [Discard and continue] (or cancel, which ends the new session);
//      then wipe it. Another account's progress is never pushed into this one.
//   3. reconcileUp: push this browser's unsynced progress (anonymous progress merges, newest wins)
//   4. writeOwner(publicId) (+ the bridge's cached initial)
//   5. broadcast {type:"auth-changed"} to open hub tabs
//   6. location.assign(next)
// Dependencies are injectable so the flow is unit-tested without a browser or a server.
import {
  readOwner,
  wipeKeys,
  writeOwner,
  writeProfile,
  type StorageLike,
} from '@bridge-shared';
import { createSession, endSession, type MeUser } from './api';
import { broadcast as postBroadcast, type BridgeMessage } from './broadcast';
import { allLegacyKeys, countUnsynced, downloadUnsynced, loadSyncHubs, type LoadedHubs, type SyncHub } from './hubs';
import { pageNavigation } from './navigation';
import { reconcileUp, type ReconcileOptions, type ReconcileReport } from './reconcile';

export type SwitchChoice = 'download' | 'discard' | 'cancel';
export type SignInStep = 'session' | 'checking' | 'syncing' | 'redirecting';

export interface SwitchPrompt {
  /** Unsynced parts that would be lost. */
  unsynced: number;
  hubs: SyncHub[];
}

export interface SignInDeps {
  storage: StorageLike | null;
  /** Owner tag differs and local progress is unsynced: what should happen to it? */
  confirmSwitch(prompt: SwitchPrompt): Promise<SwitchChoice>;
  /** Runs once the session exists (the Firebase pages sign out of Firebase here). */
  afterSession?: () => unknown;
  onStep?: (step: SignInStep) => void;
  createSession?: (idToken: string) => Promise<MeUser>;
  endSession?: () => Promise<void>;
  loadHubs?: (storage: StorageLike) => Promise<LoadedHubs>;
  reconcile?: (opts: ReconcileOptions) => Promise<ReconcileReport>;
  download?: (storage: StorageLike, hubs: readonly SyncHub[]) => void;
  broadcast?: (message: BridgeMessage) => void;
  assign?: (url: string) => void;
}

export type SignInOutcome =
  | { status: 'done'; user: MeUser; next: string; wiped: boolean; report: ReconcileReport | null }
  | { status: 'cancelled' };

/**
 * Run steps 1-6 with an ID token (Firebase or fake). API failures of step 1 are thrown as
 * `ApiProblem` (e.g. `email_unverified`, `stale_login`); later steps never fail the sign-in:
 * whatever reconcileUp could not push is pushed by the hub pages on their next load.
 */
export async function completeSignIn(idToken: string, next: string, deps: SignInDeps): Promise<SignInOutcome> {
  const step = deps.onStep ?? (() => undefined);
  step('session');
  const user = await (deps.createSession ?? createSession)(idToken);
  try {
    await deps.afterSession?.();
  } catch {
    /* best effort */
  }

  const storage = deps.storage;
  let wiped = false;
  let report: ReconcileReport | null = null;
  if (storage) {
    step('checking');
    const { hubs, fromCatalog } = await (deps.loadHubs ?? loadSyncHubs)(storage);
    const owner = readOwner(storage);
    if (owner && owner !== user.publicId) {
      const unsynced = countUnsynced(storage, hubs);
      if (unsynced > 0) {
        const choice = await deps.confirmSwitch({ unsynced, hubs });
        if (choice === 'cancel') {
          try {
            await (deps.endSession ?? endSession)();
          } catch {
            /* the bridge stays in "mismatch" mode for this session anyway */
          }
          return { status: 'cancelled' };
        }
        if (choice === 'download') (deps.download ?? downloadUnsynced)(storage, hubs);
      }
      wipeKeys(storage, allLegacyKeys(hubs));
      wiped = true;
    }

    if (fromCatalog) {
      step('syncing');
      report = await (deps.reconcile ?? reconcileUp)({ storage, hubs });
    }
    writeOwner(storage, user.publicId);
    writeProfile(storage, user.publicId, user.name || user.email);
  }

  (deps.broadcast ?? postBroadcast)({ type: 'auth-changed' });
  step('redirecting');
  (deps.assign ?? pageNavigation.assign)(next);
  return { status: 'done', user, next, wiped, report };
}

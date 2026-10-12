// Sign-out (build-contracts.md §14, spec §4.6 step 7):
//   1. broadcast {type:"flush"} to open hub tabs and wait 1 s
//   2. reconcileUp
//   3. anything still unsynced → the page offers [Try again] [Download unsynced progress (.json)]
//      [Sign out anyway]
//   4. POST /api/auth/logout
//   5. wipe this browser's hub progress (keeps studyhub.codeLang and studyhubs.ui.*)
//   6. broadcast {type:"logout"} and go to /
// `prepareSignOut` is steps 1-3, `finishSignOut` steps 4-6 (the page navigates).
import { wipeKeys, type StorageLike } from '@bridge-shared';
import { endSession } from './api';
import { broadcast as postBroadcast, type BridgeMessage } from './broadcast';
import { allLegacyKeys, countUnsynced, loadSyncHubs, type LoadedHubs, type SyncHub } from './hubs';
import { reconcileUp, type ReconcileOptions, type ReconcileReport } from './reconcile';

/** How long hub tabs get to push their pending progress after the flush broadcast. */
export const FLUSH_WAIT_MS = 1000;

export interface SignOutDeps {
  storage: StorageLike | null;
  loadHubs?: (storage: StorageLike) => Promise<LoadedHubs>;
  reconcile?: (opts: ReconcileOptions) => Promise<ReconcileReport>;
  endSession?: () => Promise<void>;
  broadcast?: (message: BridgeMessage) => void;
  wait?: (ms: number) => Promise<void>;
}

export interface SignOutCheck {
  hubs: SyncHub[];
  /** Parts still unsynced after the push (0 = safe to sign out). */
  unsynced: number;
  report: ReconcileReport | null;
  /** False when the catalog could not be loaded (nothing was pushed). */
  fromCatalog: boolean;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Steps 1-3: let hub tabs flush, push what is left, and count what is still unsynced. */
export async function prepareSignOut(deps: SignOutDeps): Promise<SignOutCheck> {
  (deps.broadcast ?? postBroadcast)({ type: 'flush' });
  await (deps.wait ?? sleep)(FLUSH_WAIT_MS);
  const storage = deps.storage;
  if (!storage) return { hubs: [], unsynced: 0, report: null, fromCatalog: false };
  const { hubs, fromCatalog } = await (deps.loadHubs ?? loadSyncHubs)(storage);
  const report = fromCatalog ? await (deps.reconcile ?? reconcileUp)({ storage, hubs }) : null;
  return { hubs, unsynced: countUnsynced(storage, hubs), report, fromCatalog };
}

/**
 * Steps 4-6. Ends the session first: if that fails (it throws `ApiProblem`), nothing is wiped
 * and the user is still signed in.
 */
export async function finishSignOut(deps: SignOutDeps, hubs: readonly SyncHub[]): Promise<string[]> {
  await (deps.endSession ?? endSession)();
  const removed = deps.storage ? wipeKeys(deps.storage, allLegacyKeys(hubs)) : [];
  (deps.broadcast ?? postBroadcast)({ type: 'logout' });
  return removed;
}

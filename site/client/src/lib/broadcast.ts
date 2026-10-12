// Messages to the bridge in open hub tabs, on BroadcastChannel "studyhubs" (build-contracts.md §13):
//   {type:"flush"}        push pending progress now (sign-out asks this before ending the session)
//   {type:"auth-changed"} a sign-in happened: hub tabs reload (hidden) or offer a reload (visible)
//   {type:"logout"}       the session ended: hub tabs stop syncing, wipe their progress and reload

export const CHANNEL = 'studyhubs';

export type BridgeMessage = { type: 'flush' } | { type: 'auth-changed' } | { type: 'logout' };

/** Post one message to every other same-origin tab. A browser without BroadcastChannel just skips it. */
export function broadcast(message: BridgeMessage): void {
  if (typeof BroadcastChannel !== 'function') return;
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    /* ignore: tabs then catch up on their next reload */
  }
}

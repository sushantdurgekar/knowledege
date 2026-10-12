// reconcileUp: push this browser's unsynced hub progress to the account (build-contracts.md §14,
// spec §4.6 steps 6-7). Used right after signing in (anonymous progress merges into the account,
// newest wins on the server) and before signing out (so nothing is lost when the keys are wiped).
//
//  - Payloads come from the bridge's shared builders (`localHubParts`), so they are byte-for-byte
//    what the hub or the bridge would send.
//  - One `POST /api/sync` per batch: a batch holds at most 25 hubs and at most 1 MiB of JSON; a hub
//    too big for one batch is split by part. Bodies are gzipped with CompressionStream when the
//    browser has it (`Content-Encoding: gzip`), else sent as plain JSON.
//  - Each acknowledged part (`accepted`, `duplicate` or `stale`) is marked synced at the stamp that
//    was sent; `rejected` parts stay unsynced (the sign-out page then offers a download).
import { localHubParts, markSynced, type AnyPart, type HubRef, type StorageLike } from '@bridge-shared';
import { api, ApiProblem, isApiProblem } from './api';
import { countUnsynced } from './hubs';

/** Largest JSON body per request (the server takes 2 MiB on the wire). */
export const MAX_BATCH_BYTES = 1024 * 1024;
/** The server's per-request hub limit. */
export const MAX_HUBS_PER_REQUEST = 25;

type Payload = { upd: number } & Record<string, unknown>;
export type HubParts = Record<string, Payload>;
export interface SyncBody {
  hubs: Record<string, HubParts>;
}

/** gzip a JSON string. */
export type Compressor = (json: string) => Promise<Uint8Array<ArrayBuffer>>;

const encoder = new TextEncoder();
export const byteLength = (text: string): number => encoder.encode(text).length;
const jsonBytes = (value: unknown): number => byteLength(JSON.stringify(value));

/** gzip through CompressionStream, or null when this browser has none. */
export function defaultCompressor(): Compressor | null {
  if (typeof CompressionStream !== 'function' || typeof Response !== 'function') return null;
  return async (json) => {
    const source = new Response(json).body;
    if (!source) throw new Error('no body stream');
    const gz = source.pipeThrough(new CompressionStream('gzip'));
    return new Uint8Array(await new Response(gz).arrayBuffer());
  };
}

export interface SyncUnit {
  hub: string;
  parts: HubParts;
}

/** One unit per hub that has unsynced parts, in catalog order. */
export function collectUnits(storage: StorageLike, hubs: readonly HubRef[]): SyncUnit[] {
  const units: SyncUnit[] = [];
  for (const hub of hubs) {
    const parts = localHubParts(storage, hub) as HubParts;
    if (Object.keys(parts).length > 0) units.push({ hub: hub.id, parts });
  }
  return units;
}

export interface BatchLimits {
  maxBytes?: number;
  maxHubs?: number;
}

const EMPTY_BODY_BYTES = jsonBytes({ hubs: {} });

/**
 * Pack units into request bodies of at most `maxBytes` (JSON, UTF-8) and `maxHubs` hubs.
 * A unit larger than `maxBytes` is split into one piece per part; a single part that is still
 * larger goes alone in its own request (the server answers it per part, e.g. `too_large`).
 */
export function planBatches(units: readonly SyncUnit[], limits: BatchLimits = {}): SyncBody[] {
  const maxBytes = limits.maxBytes ?? MAX_BATCH_BYTES;
  const maxHubs = limits.maxHubs ?? MAX_HUBS_PER_REQUEST;

  const pieces: SyncUnit[] = [];
  for (const unit of units) {
    if (EMPTY_BODY_BYTES + jsonBytes(unit.hub) + 1 + jsonBytes(unit.parts) <= maxBytes) pieces.push(unit);
    else for (const [part, payload] of Object.entries(unit.parts)) pieces.push({ hub: unit.hub, parts: { [part]: payload } });
  }

  const batches: SyncBody[] = [];
  let current: Record<string, HubParts> = {};
  let hubCount = 0;
  let size = EMPTY_BODY_BYTES;

  const flush = () => {
    if (hubCount > 0) batches.push({ hubs: current });
    current = {};
    hubCount = 0;
    size = EMPTY_BODY_BYTES;
  };

  for (const piece of pieces) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const existing = current[piece.hub];
      let cost: number;
      if (existing) {
        // Adding parts inside an existing hub object: `,"part":{...}` for each.
        cost = 0;
        for (const [part, payload] of Object.entries(piece.parts)) cost += 1 + jsonBytes(part) + 1 + jsonBytes(payload);
      } else {
        cost = (hubCount > 0 ? 1 : 0) + jsonBytes(piece.hub) + 1 + jsonBytes(piece.parts);
      }
      const fits = size + cost <= maxBytes && (existing || hubCount < maxHubs);
      if (fits || hubCount === 0) {
        if (existing) Object.assign(existing, piece.parts);
        else {
          current[piece.hub] = { ...piece.parts };
          hubCount++;
        }
        size += cost;
        break;
      }
      flush(); // and retry the piece in a fresh batch
    }
  }
  flush();
  return batches;
}

export type PartStatus = 'accepted' | 'duplicate' | 'stale' | 'rejected';

export interface ReconcileReport {
  /** Requests sent (successful or not). */
  requests: number;
  /** Requests planned. */
  batches: number;
  accepted: number;
  duplicate: number;
  stale: number;
  rejected: number;
  /** Whether bodies were gzipped. */
  gzip: boolean;
  /** The last request-level failure, if any (the run stops on the ones that affect every request). */
  problem: ApiProblem | null;
  /** Parts still unsynced after the run. */
  remaining: number;
}

export interface ReconcileOptions extends BatchLimits {
  storage: StorageLike;
  hubs: readonly HubRef[];
  /** gzip implementation; defaults to CompressionStream when available. `null` sends plain JSON. */
  compress?: Compressor | null;
  signal?: AbortSignal;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Failures that would hit every other batch too: stop instead of hammering the server. */
function stopsRun(problem: ApiProblem): boolean {
  return (
    problem.status === 0 ||
    problem.status === 401 ||
    problem.status === 403 ||
    problem.status === 429 ||
    problem.status >= 500 ||
    problem.code === 'clock_skew'
  );
}

async function postBatch(body: SyncBody, compress: Compressor | null, signal?: AbortSignal): Promise<unknown> {
  const json = JSON.stringify(body);
  let payload: BodyInit = json;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (compress) {
    try {
      payload = await compress(json);
      headers['Content-Encoding'] = 'gzip';
    } catch {
      payload = json; // fall back to plain JSON
    }
  }
  return api('/api/sync', { method: 'POST', body: payload, headers, signal });
}

/** Push every unsynced part of `hubs`; never throws for server or network failures. */
export async function reconcileUp(opts: ReconcileOptions): Promise<ReconcileReport> {
  const { storage, hubs } = opts;
  const compress = opts.compress === undefined ? defaultCompressor() : opts.compress;
  const batches = planBatches(collectUnits(storage, hubs), opts);
  const report: ReconcileReport = {
    requests: 0,
    batches: batches.length,
    accepted: 0,
    duplicate: 0,
    stale: 0,
    rejected: 0,
    gzip: compress !== null,
    problem: null,
    remaining: 0,
  };

  for (const body of batches) {
    report.requests++;
    let reply: unknown;
    try {
      reply = await postBatch(body, compress, opts.signal);
    } catch (error) {
      if (!isApiProblem(error)) throw error; // an abort
      report.problem = error;
      if (stopsRun(error)) break;
      continue;
    }
    const results = isObject(reply) && isObject(reply.results) ? reply.results : {};
    for (const [hubId, parts] of Object.entries(body.hubs)) {
      const hubResults = isObject(results[hubId]) ? (results[hubId] as Record<string, unknown>) : {};
      for (const [part, sent] of Object.entries(parts)) {
        const result = hubResults[part];
        const status = isObject(result) ? result.status : undefined;
        if (status === 'accepted' || status === 'duplicate' || status === 'stale') {
          // stale: the account already holds a newer copy, which the hub adopts on its next load.
          markSynced(storage, hubId, part as AnyPart, sent.upd);
          report[status]++;
        } else if (status === 'rejected') {
          report.rejected++;
        }
      }
    }
  }

  report.remaining = countUnsynced(storage, hubs);
  return report;
}

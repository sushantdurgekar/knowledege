/**
 * Helpers for the M2 scenarios (build-contracts.md sections 17-22): the admin user, sign-in
 * with a chosen provider, the scheduler's test tick, and the offline `backup_tool.py verify`.
 *
 * The server must run with ADMIN_EMAILS containing ADMIN.email (scripts/dev-e2e.sh passes
 * ADMIN_EMAILS=admin@studyhubs.test and ADMIN_TZ=Asia/Kolkata) on top of the M1 test setup.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { API_HEADERS, fakeToken, type TestUser } from './sync';

/** Admins are Google accounts listed in ADMIN_EMAILS (§17). */
export const ADMIN: TestUser = { uid: 'e2e-admin', email: 'admin@studyhubs.test' };
export const GOOGLE = { provider: 'google.com' } as const;
export const ADMIN_TZ = 'Asia/Kolkata';

const TEST_HEADERS = { 'X-StudyHubs': '1' };

/** Sign `context` in through the API with extra token claims (e.g. the Google provider). */
export async function signInAs(context: BrowserContext, user: TestUser, extra: Record<string, unknown> = {}): Promise<string> {
  const r = await context.request.post('/api/auth/session', {
    headers: API_HEADERS,
    data: { idToken: fakeToken(user, extra) },
  });
  expect(r.status(), `POST /api/auth/session as ${user.uid}: ${await r.text()}`).toBe(200);
  const body = (await r.json()) as { user?: { publicId?: string } };
  expect(body.user?.publicId).toBeTruthy();
  return body.user!.publicId!;
}

/** The admin, signed in through the API (a Google account in ADMIN_EMAILS, just signed in). */
export const signInAdmin = (context: BrowserContext): Promise<string> => signInAs(context, ADMIN, GOOGLE);

/** Run the job scheduler once now (POST /api/test/tick); returns what it did. */
export async function tick(request: APIRequestContext): Promise<{ events: string[]; maintenance: { mode: string } }> {
  const r = await request.post('/api/test/tick', { headers: TEST_HEADERS });
  expect(r.status(), 'POST /api/test/tick').toBe(200);
  return (await r.json()) as { events: string[]; maintenance: { mode: string } };
}

/** "YYYY-MM-DDTHH:mm" wall-clock time of `ms` in `timeZone` (what <input type=datetime-local> takes). */
export function wallClock(ms: number, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/* ─────────────────────────── backup_tool.py ─────────────────────────── */

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BACKUP_TOOL = path.join(SITE, 'scripts', 'backup_tool.py');
/** The server venv has `cryptography` (needed for encrypted files); fall back to python3. */
const PYTHON = fs.existsSync(path.join(SITE, 'server', '.venv', 'bin', 'python'))
  ? path.join(SITE, 'server', '.venv', 'bin', 'python')
  : 'python3';

export interface VerifySummary {
  counts: Record<string, number>;
  [key: string]: unknown;
}

/** `backup_tool.py verify <file>` (exit 0 = valid); returns its JSON summary. */
export function verifyBackup(file: string, passphrase?: string): VerifySummary {
  const args = ['-I', BACKUP_TOOL, 'verify', file];
  let passFile: string | null = null;
  if (passphrase !== undefined) {
    passFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sh-pass-')), 'passphrase.txt');
    fs.writeFileSync(passFile, passphrase + '\n', { mode: 0o600 });
    args.push('--passphrase-file', passFile);
  }
  try {
    const out = execFileSync(PYTHON, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    return JSON.parse(out) as VerifySummary;
  } catch (error) {
    const e = error as { status?: number; stderr?: string };
    throw new Error(`backup_tool.py verify failed (exit ${e.status}): ${e.stderr ?? String(error)}`);
  } finally {
    if (passFile) fs.rmSync(path.dirname(passFile), { recursive: true, force: true });
  }
}

/** Save a Playwright download to a fresh temp dir and return the file path. */
export async function saveDownload(download: { suggestedFilename(): string; saveAs(p: string): Promise<void> }): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sh-e2e-'));
  const file = path.join(dir, download.suggestedFilename());
  await download.saveAs(file);
  return file;
}

/** Every key in the page's localStorage, sorted. */
export const storageKeys = (page: Page): Promise<string[]> => page.evaluate(() => Object.keys(localStorage).sort());

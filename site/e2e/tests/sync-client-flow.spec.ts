/**
 * M1 client flows in fake-auth mode (build-contracts.md §14): the "Test sign-in" form,
 * `next` handling, the header account menu, the unverified-email detour and /signout.
 */
import { expect, test } from '@playwright/test';
import { hubPath } from './support/catalog';
import { watchPage } from './support/hub';
import {
  V2_HUB,
  expectSignedInHub,
  resetServer,
  submitTestSignIn,
  userA,
} from './support/sync';

test.beforeEach(async ({ request }) => {
  await resetServer(request);
});

test('the config says fake auth, and /signin offers only the Test sign-in form', async ({ page, request }) => {
  const config = await (await request.get('/api/config')).json();
  expect(config).toMatchObject({ authMode: 'fake', firebase: null });
  const watch = await watchPage(page);
  await page.goto('/signin');
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(page.locator('form.form--test')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Test sign-in' })).toBeVisible();
  expect(watch.external, 'the Firebase SDK and Google are never contacted in fake mode').toEqual([]);
});

test('Test sign-in goes to `next`; the header menu reaches the account page; /signout ends the session', async ({
  page,
  context,
}) => {
  await watchPage(page);
  await page.goto('/signin?next=%2Faccount');
  await submitTestSignIn(page, userA);
  await page.waitForURL((u) => u.pathname === '/account');
  await expect(page.getByRole('heading', { name: 'Your account', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Profile').getByText(userA.email)).toBeVisible();
  const cookies = (await context.cookies()).map((c) => c.name);
  expect(cookies).toEqual(expect.arrayContaining(['sh_session', 'sh_hint']));
  const session = (await context.cookies()).find((c) => c.name === 'sh_session')!;
  expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

  // The header shows the user's initial with a menu.
  const menu = page.getByRole('button', { name: /^Account menu, signed in as / });
  await expect(menu).toBeVisible();
  await expect(menu).toHaveText('L');
  await menu.click();
  await expect(page.getByRole('menuitem', { name: 'Sign out' }).or(page.getByRole('link', { name: 'Sign out' }))).toBeVisible();

  await page.goto('/signout');
  await page.waitForURL((u) => u.pathname === '/');
  expect((await context.cookies()).map((c) => c.name)).not.toContain('sh_session');
  const me = await (await context.request.get('/api/me')).json();
  expect(me).toEqual({ signedIn: false });
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
});

test('signing in from a hub returns to that hub, signed in', async ({ page }) => {
  await watchPage(page);
  await page.goto(`/signin?next=${encodeURIComponent(hubPath(V2_HUB))}`);
  await submitTestSignIn(page, userA);
  await page.waitForURL((u) => u.pathname === hubPath(V2_HUB));
  await expectSignedInHub(page);
});

test('an unsafe `next` falls back to the home page', async ({ page }) => {
  await watchPage(page);
  await page.goto('/signin?next=' + encodeURIComponent('https://example.com/phish'));
  await submitTestSignIn(page, userA);
  await page.waitForURL((u) => u.pathname === '/');
  await expect(page.getByRole('heading', { name: 'Find a hub and start studying' })).toBeVisible();
});

test('an unverified email/password account is sent to /verify and gets no session', async ({ page, context }) => {
  await watchPage(page);
  await page.goto('/signin?next=%2Faccount');
  await submitTestSignIn(page, userA, { verified: false });
  await page.waitForURL((u) => u.pathname === '/verify');
  expect(new URL(page.url()).searchParams.get('next')).toBe('/account');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Verify your email|Check your email/);
  expect((await context.cookies()).map((c) => c.name)).not.toContain('sh_session');
});

# Firebase: sign-in and Firestore

The site uses two Firebase products on the free **Spark** plan:

- **Firebase Authentication**: Google and email/password sign-in. The browser signs in with the
  Firebase web SDK, then hands the ID token to the server, which sets its own session cookie.
- **Cloud Firestore** (Standard edition, database `(default)`, `asia-southeast1`): every account
  record, learner progress, site settings, the quiz library and saved quiz rooms. Only the server
  reads and writes it, with a dedicated service account. Security Rules deny all client access.

First-time setup is in [`site/README.md` → M1: accounts and sync](../../README.md#m1-accounts-and-sync).
This guide is for running it afterwards.

## 1. What lives where in the Firebase console

| Console page | What to look at |
|---|---|
| **Authentication → Users** | Every account. Deleting a user here does not delete their progress: use the site's account deletion instead (it removes both and records a tombstone) |
| **Authentication → Settings → Authorized domains** | Every host the site is served from (`study-hubs.onrender.com`, custom domains, `localhost`). Sign-in fails with `auth/unauthorized-domain` on any other host |
| **Authentication → Sign-in method** | Google and Email/Password on; Email link off |
| **Firestore → Data** | `users`, `progress`, `tombstones`, `meta` (settings, quiz library, saved rooms), `jobs`, `usage` |
| **Firestore → Usage** | Reads, writes and deletes per day against the free quota |
| **Firestore → Rules** | Must be `allow read, write: if false;` |
| **Project settings → Service accounts** | Only for reading the project id; keys are managed in Google Cloud (below) |

Google Cloud console (same project) → **IAM & Admin → Service Accounts** holds the server's
account `study-hubs-server@<project-id>.iam.gserviceaccount.com` with exactly two roles:
**Cloud Datastore User** and **Firebase Authentication Admin**.

## 2. Free quotas and what they mean here

Spark (no billing account) gives, per project, for the `(default)` Firestore database
(Google's [Firestore quotas page](https://cloud.google.com/firestore/quotas), checked 2026-11-05):

| Quota | Free amount | Resets | What uses it here |
|---|---|---|---|
| Stored data | 1 GiB | n/a | Progress documents (largest), quiz library and pictures, saved rooms |
| Document reads | 50,000 / day | Midnight Pacific | Sign-ins, page loads of signed-in users, backups (one read per document), restores |
| Document writes | 20,000 / day | Midnight Pacific | Progress sync, quiz library saves, saved quiz rooms (~5 per question), restores |
| Document deletes | 20,000 / day | Midnight Pacific | Account deletions, closed quiz rooms |
| Outbound data | 10 GiB / month | Monthly | Small: the server and Firestore are in the same region |

The server keeps its own count in `usage/<day>` and slows sync down as the day's write budget fills
(the `SYNC_TIERS`), so a busy day degrades gracefully instead of failing. **Admin → Overview** shows
the meters. See [capacity-and-limits.md](capacity-and-limits.md) for the numbers per feature.

If you ever need more, there are two ways forward:
1. **Upgrade the project to Blaze (pay as you go).** Nothing in the code changes; usage beyond the
   free amounts is billed. Set a **budget alert** in Google Cloud Billing first. This is the
   smallest step and is usually cents a month for a site this size.
2. **Move the data to PostgreSQL** (the server supports `STORE=postgres`). See
   [migration-overview.md](migration-overview.md).

## 3. The service-account key

The server authenticates to Firestore and Firebase Auth with a JSON key for
`study-hubs-server`. On Render it is a **Secret File** named `firebase-sa.json`, mounted at
`/etc/secrets/firebase-sa.json`; `GOOGLE_APPLICATION_CREDENTIALS` points there.

### Rotate the key (do this whenever it may have been seen)

A key that appeared in a screenshot, a chat, a ticket or a commit must be treated as public.
Rotation takes about ten minutes and causes no downtime if done in this order:

1. **Create the new key.** Google Cloud console → **IAM & Admin → Service Accounts** →
   `study-hubs-server` → **Keys → Add key → Create new key → JSON**. A file downloads.
2. **Put it on Render.** Render → **study-hubs → Environment → Secret Files** → edit
   `firebase-sa.json` → replace the whole content with the new file's content → **Save changes**.
   Choose **Save and deploy** (or deploy afterwards): the running instance keeps the old file until
   it restarts.
3. **Check the new key is in use.** After the deploy is live:
   - Render → **Logs**: the start-up line shows `auth=firebase store=firestore`, and there is no
     `Firestore unavailable`, `DefaultCredentialsError` or `invalid_grant` line.
   - Sign in on the site, open **Admin → Overview**: the Firestore meters load (they come from
     Firestore through the new key).
   - Optional: Google Cloud console → **IAM & Admin → Service Accounts → study-hubs-server →
     Metrics / Keys**: the new key's "Last used" date fills in within a few hours.
4. **Delete the old key.** Same **Keys** tab → the old key id (the one you are replacing, e.g. the
   one ending `…510a49`) → **Delete**. Only now is the leaked key useless. Leave exactly one key.
5. **Delete the downloaded file** from your computer (Downloads, trash, any chat upload). Never
   commit it, paste it into notes or share a screenshot of it.

If something fails after step 2, the site still runs on the old key until the next restart:
re-check that the whole JSON was pasted (it starts with `{"type": "service_account"`), redeploy,
and only delete the old key once step 3 passes.

### Stronger option: no downloadable keys at all

Keys are long-lived passwords. When the site moves to AWS or Azure, prefer **Workload Identity
Federation** (Google trusts the cloud's own identity, so there is no key file) — see the
migration guides. On Render there is no workload identity, so a key file is the practical choice;
rotate it at least once a year and whenever it might have leaked.

## 4. Adding a domain (custom domain or a new host)

When the site gets a new address (a custom domain on Render, or a new platform after a move):

1. Firebase console → **Authentication → Settings → Authorized domains → Add domain**:
   `quiz.example.com` (no scheme, no path).
2. Google Cloud console → **APIs & Services → Credentials** → **Browser key (auto created by
   Firebase)** → **Application restrictions → Websites**: add `https://quiz.example.com/*`. Keep
   the old entries until the old address is retired.
3. Google Auth Platform → **Branding**: add the domain under **Authorized domains**; update the home
   page and privacy policy links (`https://quiz.example.com/privacy`) if this becomes the main address.
4. The server: set `PUBLIC_ORIGIN=https://quiz.example.com` (Render → Environment) and deploy. The
   server also accepts `RENDER_EXTERNAL_URL` as a second origin, so the `onrender.com` address keeps
   working.
5. Test sign-in with Google and with email/password on the new address.

## 5. Daily and monthly checks

| When | Check | Where |
|---|---|---|
| Weekly | Writes and reads stay under ~50% of the daily quota on normal days | **Admin → Overview** |
| Monthly | Firestore stored data (press **Recount storage** once a month; it reads every progress document once) | **Admin → Overview** |
| Monthly | Take an encrypted backup and verify it offline | **Admin → Backup**, then `backup_tool.py verify` |
| Monthly | Only one key on `study-hubs-server`, created within the last 12 months | Google Cloud → Service Accounts → Keys |
| After any screenshot or screen share of the Render dashboard | Rotate the key if a Secret File or env value was visible | Section 3 |

## 6. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails: `FIREBASE_WEB_CONFIG must be JSON` | The value is empty or not one of the accepted forms | Paste the one-line JSON, or the console's `const firebaseConfig = {…}` snippet, without a `FIREBASE_WEB_CONFIG=` prefix |
| Deploy fails: `GOOGLE_APPLICATION_CREDENTIALS does not name a readable file` | The Secret File is missing or has another name | Render → Environment → Secret Files: the name must be exactly `firebase-sa.json` |
| Logs: `Firestore unavailable` / `PermissionDenied` | The key's account lacks **Cloud Datastore User**, or the key was deleted | Check the roles; rotate the key (section 3) |
| Sign-in page: "Sign-in isn't set up for this site address yet" | The host is not in Authorized domains, or `PUBLIC_ORIGIN` does not match the address | Section 4 |
| Sign-in: `403 csrf` / "Your browser blocked the request" | The page's origin is neither `PUBLIC_ORIGIN` nor `RENDER_EXTERNAL_URL` | Set `PUBLIC_ORIGIN` to the address in the browser bar |
| Account deletion fails at "delete the sign-in" | The key's account lacks **Firebase Authentication Admin** | Add the role; the deletion is safe to retry |
| Sync shows "Sync paused" for everyone | The day's write budget is spent | Wait for the reset (midnight Pacific; **Admin → Overview** shows it in IST too), or upgrade to Blaze |

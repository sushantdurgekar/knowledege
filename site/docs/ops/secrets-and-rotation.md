# Secrets and rotation

Every secret the site uses, where it lives, what breaks if it leaks, and how to replace it.
Rule of thumb: **anything that appeared on screen in a screenshot, screen share, chat or ticket is
leaked.** Rotate it, then delete the old one.

## Inventory

| Secret | Lives in | Used by | If it leaks | Rotate |
|---|---|---|---|---|
| Firebase service-account key (`firebase-sa.json`) | Render Secret File | Server → Firestore and Firebase Auth | Anyone can read, change or delete every account and all progress | [Below](#firebase-service-account-key) |
| `SECRET_KEY` | Render env (generated) | Signs public ids and test sessions | Forged public ids | Only if leaked: [below](#secret_key) |
| `RENDER_DEPLOY_HOOK` | GitHub Actions secret | CI deploy job | Anyone can trigger deploys (of `main` only) | [Below](#render_deploy_hook) |
| `ANTHROPIC_API_KEY` (optional) | Render env | AI question drafts | Someone spends your API credit | [Below](#anthropic_api_key) |
| Backup passphrases | Your password manager | Encrypted `.backup` files | That backup's contents (all progress) | Make new backups with a new passphrase; delete old files |
| Your Google admin account | Google | **Admin** pages | Full admin access | Google account security; remove from `ADMIN_EMAILS` |

Not secrets (safe in the browser by design): `FIREBASE_WEB_CONFIG` including its `apiKey` (it is
restricted to the site's addresses and two APIs), the presenter link key (view-only), the room PIN.

## Firebase service-account key

Full steps with checks: [firebase.md → Rotate the key](firebase.md#rotate-the-key-do-this-whenever-it-may-have-been-seen).
In short:

1. Google Cloud → IAM & Admin → Service Accounts → `study-hubs-server` → Keys → **Add key → JSON**.
2. Render → Environment → Secret Files → `firebase-sa.json` → paste the new content → **Save and deploy**.
3. After the deploy: logs clean, **Admin → Overview** loads.
4. **Delete the old key** in the Keys tab. Until you do, the leaked key still works.
5. Delete the downloaded JSON from your computer.

**Status (2026-11-05):** the key was replaced on Render after the earlier screenshot. Finish with
steps 3–5: confirm the site works on the new key, then delete the old key (id ending `…510a49`)
in Google Cloud so only one key remains.

## SECRET_KEY

It signs each user's `publicId`. Changing it changes every `publicId`, and each browser remembers
the `publicId` that owns its local progress. After a change, every browser sees a different owner:
hub pages stop syncing until the learner signs in again, and at that sign-in a browser holding
progress that never reached the server asks first (offering a download of it) before replacing its
copy with the account's. Server-side progress is untouched, but everyone notices.

Rotate only if it leaked:
1. Generate 64 random hex characters: `python -c "import secrets; print(secrets.token_hex(32))"`.
2. Render → Environment → `SECRET_KEY` → paste → Save and deploy.
3. Tell learners they may need to sign in again.

## RENDER_DEPLOY_HOOK

1. Render → study-hubs → **Settings → Deploy Hook → Regenerate** (the old URL stops working at once).
2. GitHub → repo → **Settings → Secrets and variables → Actions → `RENDER_DEPLOY_HOOK` → Update**
   with the new URL.
3. Run **Actions → site → Run workflow** on `main` to prove the new hook works.

## ANTHROPIC_API_KEY

1. In the Claude Console, create a new key for this site only, with a **monthly spend limit**.
2. Render → Environment → `ANTHROPIC_API_KEY` → paste → Save and deploy.
3. In the quiz editor, **Draft with AI** appears; draft one question to check.
4. Delete the old key in the Claude Console.

To turn AI drafting off, delete the variable and deploy: the button disappears and the server no
longer loads the AI library at all.

## Habits that prevent leaks

- Never paste a secret into a note, a chat, an issue, a commit or `CLAUDE.md`. The vault's `.env`
  files stay local and are git-ignored.
- Before a screen share or screenshot of Render, close **Environment** and **Secret Files**.
- One key per purpose. Never reuse the site's service-account key for scripts on your laptop.
- Review once a month: Google Cloud service-account keys (only one, recent), Render deploy hook,
  GitHub secrets, `ADMIN_EMAILS`.

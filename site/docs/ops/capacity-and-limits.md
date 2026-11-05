# Capacity and limits

What uses memory, storage and the daily Firestore budget, how to read the meters on
**Admin → Overview**, and when to act.

## "Why is it already using 128 MB of 512 MB?"

That meter is **Server memory**: the RAM of the one server process (its resident set size)
against the 512 MiB of Render's free instance. It is **not the database**. The database meter is
**Firestore storage**, which counts against a separate 1 GiB.

Most of the 128 MB is the code the server loads at start, not data. Measured on 2026-11-05
(Python 3.12, Linux, `site/server` virtualenv, importing one layer after another):

| Layer | Adds | Running total |
|---|---|---|
| Python interpreter | 9 MB | 9 MB |
| FastAPI, Starlette, Pydantic, Uvicorn | 31 MB | 40 MB |
| The site's own code, hub catalog, routes | 9 MB | **49 MB** (local start-up, in-memory store) |
| Google Firestore client + gRPC + protobuf, Firebase Admin, Google Auth | 29 MB | **78 MB** (production start-up) |
| Anthropic SDK + its HTTP stack | 24 MB | 102 MB: what production started at **before this change** |

After start-up the process grows to a steady level and stays there, because:
- gRPC opens its channels and worker threads at the first Firestore call;
- the quiz question bank (`quiz-bank.json`, ~0.5 MB of JSON), the catalog and caches are parsed
  on first use;
- live quiz rooms hold their players and answers in memory (a full 250-player room is a few MB);
- Python keeps memory it has freed in its own pools for reuse, so the number rarely goes down.

So ~100–130 MB on a quiet day was expected. **Since this change the Anthropic SDK loads only when
someone drafts questions with AI**, so a server without `ANTHROPIC_API_KEY` (or one nobody drafts
on) starts about 24 MB lower, around 80 MB.

### When to worry

| Server memory | Meaning | Action |
|---|---|---|
| Under 300 MB | Normal | None |
| 300–400 MB | Something is holding data: many open rooms, a backup or restore running | Check open rooms and jobs; it should fall back after a deploy |
| Over 400 MB | Close to the limit: the platform restarts a process that passes 512 MiB | Deploy (restart) to clear it, find the cause in the logs, and plan a larger instance |

A restart is not fatal: quiz rooms are saved to Firestore and come back, and learners' hubs keep
working in their browsers. But a restart during a live quiz pauses it for the restart time.

## Firestore: storage and the daily budget

Free quotas (Spark, `(default)` database; [Firestore quotas](https://cloud.google.com/firestore/quotas),
checked 2026-11-05): **1 GiB stored**, **50,000 reads**, **20,000 writes**, **20,000 deletes per
day**, reset at midnight Pacific.

| Feature | Writes | Reads |
|---|---|---|
| A signed-in learner using a hub | About 1 per hub per sync flush (flushes are spaced by the sync tier: every 2–15 min) | 1 per hub opened |
| Sign-in | A few (the account record) | A few |
| Saving a quiz in the studio | 1 per autosave (1 s after the last change), +1 to the index on create or delete | 1 on open |
| A picture in a quiz | 1 (stored once per content hash) | 1 per first view (then browser-cached for a year) |
| A live quiz room | About 5 per question (phase changes, plus at most one save every 10 s while answers arrive), 1 delete when closed | — |
| Account deletion | Deletes: one per progress document + the user | — |
| Backup | — | One per document (users, progress, tombstones) |
| Restore (Firestore) | One per record restored, paced over days if needed | — |

**Storage** is mostly learners' progress documents (each hub's state, compressed; one document per
learner per hub). Press **Recount storage** on **Admin → Overview** once a month to update the
estimate (it reads every progress document once, so it is refused when today's reads are low).

### When to act

| Signal | Do |
|---|---|
| Writes regularly above 50% of the daily budget | Fine; the sync tiers already slow saves. Watch the trend |
| "Sync paused" for everyone on most days | Upgrade the Firebase project to **Blaze** with a budget alert, or move to Postgres |
| Storage estimate above ~700 MB | Plan the move (Blaze billing per GiB, or Postgres) before it reaches 1 GiB |
| A large restore needs several days of quota | Expected on Spark; run it overnight, or restore into Postgres instead |

## Other limits in the code

| Limit | Value | Where |
|---|---|---|
| Players per room | 250 | `app/quiz/room.py` `MAX_PLAYERS` |
| Open rooms at once | 50 | `RoomManager.MAX_ROOMS` |
| Items per quiz | 200 | `app/quiz/parse.py` |
| Picture size | 400 KB after browser shrinking (longest side 1280 px) | `app/quiz/images.py` |
| Quiz library + pictures carried in a backup | 6 MB | `app/quiz/library.py` |
| AI drafts | 3 a minute per admin, 1–15 questions each | `app/quiz/routes.py` |
| Sync part size / document size | 128 KiB / 384 KiB gzipped | `MAX_PART_GZ`, `MAX_DOC_GZ` |

## Why only one instance

The server keeps live quiz rooms and the maintenance, backup and restore scheduler in its process.
Two instances would each have their own rooms (players joining one would not see the other) and
would both run the scheduler. Scale **up** (a bigger instance) when you need more, never **out**.
Every migration guide keeps this rule: one container, one Uvicorn worker.

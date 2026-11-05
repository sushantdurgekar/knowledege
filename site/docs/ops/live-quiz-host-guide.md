# Live quiz: the host's guide

Everything an admin needs to build quizzes, run live sessions and self-paced challenges, put them
on a big screen and follow up afterwards. Players need no account: they join at `/quiz` with a
6-digit PIN.

## 0. Open quizzes: no room at all (`/quiz/open`)

Every study hub that has practice questions gets an **open quiz**: its first three topics (up to
10 questions each), playable by anyone at any time. There is no PIN, no host and no account. The
hub's later topics follow as **levels** (Topics 4–6, 7–9, …), picked with the chips on the quiz
page. Each catalog card with an open quiz has a **Quiz** button, and answers are shuffled every
game, so a replay tests the answer rather than where it sat on screen.

- **Players** pick a hub on `/quiz/open` (or **Browse open quizzes** on `/quiz`) and press **Play**:
  30 seconds per question, points for speed (500–1000), a streak bonus, the right answer and its
  explanation after each question, then the score and **Practise the ones I missed**.
- **Where results go:** the score goes into the player's quiz history and every question into
  their review deck (`/quiz/review`, `/quiz/progress`). Not signed in: **this browser only**
  (localStorage). Signed in: the same history also syncs to their account.
- **Nothing is stored on the server** for an anonymous game, so open quizzes cost no Firestore
  writes; the questions come from the hubs' own question bank, refreshed on every deploy.
- **Host it for a group:** as an admin, open any open quiz and use **Host live** or
  **Self-paced challenge** (optionally with the key points as slides). That creates a normal room
  with a PIN, presenter screen and leaderboard; the open quiz stays playable for everyone else.

## 1. Build a quiz (Quiz studio, `/quiz/host`)

Start from **New quiz** (quick or advanced), an example, a file (`.json` or `.txt`), or **From a
study hub** (key points become slides, practice questions become items). Quizzes are saved on the
server as you type and shared by every admin.

| Item type | Players… | Scored |
|---|---|---|
| Quiz (single answer) | pick one option | Yes |
| Multiple choice | pick every right option (a wrong pick cancels a right one) | Yes, partial |
| True or false | pick one | Yes |
| Type answer | type text; accepted answers can be plain or `/regex/i` | Yes |
| Match | drag the right-hand items next to their partners | Yes, partial |
| Put in order | drag items into sequence | Yes, partial |
| **Slider** | pick a number on a scale; right within ± margin | Yes |
| Poll | vote; no right answer | No |
| **Word cloud** | send a word or two; common answers grow on screen | No |
| Explain it | write an explanation, then see a model answer | No |
| Slide | read content you present | — |

Per item: time (5–300 s), points (0–5000; 2000 = "double points"), an explanation shown after the
reveal, and one picture. Advanced quizzes add confidence ratings and up to 3 hints per question.

**Slider fields:** Min, Max, Step, Right number, Margin ± (0 = exact), Unit (`%`, `km`, `ms`…).
In the text format:

```
Q: Roughly what share of web traffic uses HTTPS?
type: slider
min: 0
max: 100
step: 1
answer: 95
margin: 5
unit: %

Q: One word for how you feel about TLS now
type: cloud
```

**Draft with AI** (when the server has `ANTHROPIC_API_KEY`): pick hub modules or paste notes,
choose how many questions and which types; drafts land after the current item for you to check.
Never host AI drafts unread.

Press **Check** before hosting: it lists every problem by item number.

## 2. Open a room: the options

**Host live** or **Self-paced challenge** opens the options dialog.

| Option | What it does | When to use |
|---|---|---|
| Live / Self-paced | You run it item by item, or everyone plays at their own pace | Live for meetings and classes; self-paced for homework |
| Teams (2–6) | Players are balanced into colour teams; teams rank by average score | Big groups, departments |
| Flashcards first (self-paced) | Players can study the cards before starting | Revision |
| Schedule (self-paced) | Opens and closes by itself, up to 14 days | Weekly challenges |
| **Auto-play** (live) | After each reveal the results stay up 5–20 s, then the next item opens by itself; slides stay 12 s | When you present and talk, or a screen in a lobby |
| **Streak bonus** | +100 points per right answer in a row after the first, up to +500 | Keeps attention through long quizzes |
| **Shuffle the answer order** | Options appear in a new order (same for everyone, presenter included) | Re-running a quiz the group has seen |
| **Friendly names only** | Players choose from generated names ("Curious Otter"), three spins | Classes, company all-hands, recorded sessions |
| **Emoji reactions** | Players send 👍 👏 😂 😮 ❤️ 🔥, which float up the shared screen | On by default; turn off for exams |

## 3. Run it live

1. **Lobby:** share the join address, the PIN or the QR code. Remove a player with ×. **Lock
   joining** stops late joiners.
2. **Start**, then use **Next** or the **run sheet** to open any item next.
3. During a question: **+10 s** adds time, **Close and show answer** reveals early. A question
   closes by itself when time runs out or everyone has answered.
4. After each reveal: the answer counts, a slider's spread, the word cloud, insights (hardest
   question, most-picked wrong answer) and the leaderboard.
5. **End quiz now** finishes with the scores so far.

With auto-play, the host screen shows "Auto-play: next item in N s"; Next, the run sheet and End
still work at any time.

## 4. Present it (Teams, Zoom, projector)

1. In the host room, open **Present on another screen** and copy the **presenter link**
   (`/quiz/present/<pin>#k=<key>`). Give it to whoever shares their screen, or open it yourself in a
   second window.
2. The presenter screen is full-bleed and view-only: lobby with PIN and QR, questions with a timer
   ring, answer counts and leaderboards after each reveal, the word cloud live, the podium with
   confetti at the end. It never receives an answer before the reveal.
3. **Sound:** click once anywhere on the presenter page (browsers require it). Then it plays a pop
   per join, a rising pair when a question opens, ticks in the last five seconds, a chord on the
   reveal and a fanfare at the end. **Sound on/off** and, in the lobby, **Music on/off** are
   remembered in that browser. In a Teams call, share the window **with computer sound**.
4. **Public leaderboard:** `/quiz/board/<pin>` (or **Just watching?** on `/quiz`) lets anyone
   follow the standings without playing.

## 5. Self-paced challenges

Players move at their own pace with their own timer per question. The host sees a progress
dashboard and insights. A scheduled challenge opens and closes by itself; the final ranking
settles when it closes.

## 6. After the quiz

| Download / view | Where | Contains |
|---|---|---|
| Results (CSV) | Final screen | Rank, name, score, correct |
| **Full report (CSV)** | Final screen | One row per player per question: answer, right / partly / wrong / no answer, points, streak bonus, seconds, confidence, hints |
| **May need help** | Final screen (and the self-paced dashboard) | Players under 50% right after two or more answers |
| Insights | Final screen | Every question, hardest first |
| Export the questions to my vault | Final screen | Review cards for the Knowledge vault (`srs.py add --json-file`) |

Players get **Replay my mistakes**, flashcards, their **review deck** (`/quiz/review`) and **My
progress** (`/quiz/progress`).

## 7. Limits and good practice

- 250 players per room, 50 open rooms, 200 items per quiz.
- Rooms survive a deploy or restart (saved every few seconds); avoid deploying during a live
  session anyway.
- Close rooms you no longer need (**Close room** on the final screen): closed rooms free memory
  and stop costing writes.
- For an exam-like check: reactions off, shuffle on, no streak bonus, friendly names off (you want
  real names), and self-paced with a schedule.

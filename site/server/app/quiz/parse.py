"""Quiz content: the model, the plain-text import format and the editor's JSON form.

Both inputs end in the same validation (`_build`), so the builder and the text format can
never disagree about what a valid item is.

Item types
  single     one correct option ("* right", "- wrong")
  multi      several correct options (players must find all of them)
  truefalse  `answer: true|false`
  text       typed answer: `answer:` lines, plain text or `/regex/` (`/regex/i`), full match
  match      `pair: left = right` lines (players drag the right-hand items into place)
  order      `item:` lines in the correct order (players drag them into order)
  poll       options without a right answer; no points
  slide      a content screen (title + body) the host presents; no answer

Text format (one block per item; `#` starts a comment):

    title: Networking basics
    time: 20
    points: 1000

    Slide: How the web finds a server
    DNS turns a name into an address...      <- body: the lines after the Slide: line

    Q: Which port does HTTPS use by default?
    - 80
    * 443
    explain: shown after the answer is revealed

    Q: Put the TCP handshake in order
    item: SYN
    item: SYN-ACK
    item: ACK
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Literal

QuestionType = Literal["single", "multi", "text", "match", "truefalse", "order", "poll", "slide"]
TYPES: tuple[QuestionType, ...] = ("single", "multi", "text", "match", "truefalse", "order", "poll", "slide")
SCORED: frozenset[str] = frozenset({"single", "multi", "text", "match", "truefalse", "order"})

MAX_SOURCE_CHARS = 200_000
MAX_QUESTIONS = 200
MAX_TITLE = 200
MAX_TEXT = 1_000
MAX_BODY = 4_000
MAX_OPTION = 200
MAX_OPTIONS = 8
MAX_PAIRS = 8
MAX_ITEMS = 8
MAX_ANSWERS = 20
MIN_TIME, MAX_TIME, DEFAULT_TIME = 5, 300, 20
MIN_POINTS, MAX_POINTS, DEFAULT_POINTS = 0, 5000, 1000

_KEY = re.compile(r"^(title|time|points|type|answer|pair|item|explain)\s*:\s*(.*)$", re.IGNORECASE)
_Q = re.compile(r"^(?:q|question)\s*\d*\s*[:.)]\s*(.*)$", re.IGNORECASE)
_SLIDE = re.compile(r"^slide\s*[:.)]\s*(.*)$", re.IGNORECASE)
_REGEX = re.compile(r"^/(.*)/([a-z]*)$", re.DOTALL)


class QuizFormatError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        super().__init__("; ".join(errors))
        self.errors = errors


@dataclass(slots=True)
class TextAnswer:
    raw: str
    pattern: re.Pattern[str] | None = None  # None: exact (normalised) text

    def matches(self, value: str) -> bool:
        if self.pattern is not None:
            return self.pattern.fullmatch(value.strip()) is not None
        return normalise(value) == normalise(self.raw)


@dataclass(slots=True)
class Question:
    text: str
    type: QuestionType
    time_limit: int
    points: int
    options: list[str] = field(default_factory=list)
    correct: list[int] = field(default_factory=list)  # option indexes (single, multi, truefalse)
    answers: list[TextAnswer] = field(default_factory=list)  # text
    pairs: list[tuple[str, str]] = field(default_factory=list)  # match: (left, right)
    items: list[str] = field(default_factory=list)  # order: in the correct order
    body: str = ""  # slide
    explain: str = ""

    @property
    def scored(self) -> bool:
        return self.type in SCORED and self.points > 0

    @property
    def answerable(self) -> bool:
        return self.type != "slide"


@dataclass(slots=True)
class Quiz:
    title: str
    questions: list[Question]


def normalise(value: str) -> str:
    return " ".join(value.split()).casefold()


@dataclass(slots=True)
class _Draft:
    where: str
    text: list[str] = field(default_factory=list)
    type: str | None = None
    time: str | None = None
    points: str | None = None
    options: list[tuple[str, bool]] = field(default_factory=list)
    answers: list[str] = field(default_factory=list)
    pairs: list[str] = field(default_factory=list)
    items: list[str] = field(default_factory=list)
    body: list[str] = field(default_factory=list)
    explain: list[str] = field(default_factory=list)


def _int(value: str, low: int, high: int, what: str, where: str, errors: list[str]) -> int | None:
    try:
        number = int(str(value).strip())
    except ValueError:
        errors.append(f"{where}: {what} must be a whole number, got {str(value).strip()!r}")
        return None
    if not low <= number <= high:
        errors.append(f"{where}: {what} must be {low}-{high}, got {number}")
        return None
    return number


def _text_answer(raw: str, where: str, errors: list[str]) -> TextAnswer | None:
    raw = raw.strip()
    found = _REGEX.match(raw)
    if found is None:
        return TextAnswer(raw[:MAX_OPTION]) if raw else None
    body, flags = found.groups()
    if set(flags) - {"i"}:
        errors.append(f"{where}: only the i flag is supported in /regex/, got {flags!r}")
        return None
    try:
        pattern = re.compile(body, re.IGNORECASE if "i" in flags else 0)
    except re.error as exc:
        errors.append(f"{where}: bad regular expression {raw!r} ({exc})")
        return None
    return TextAnswer(raw, pattern)


def _infer(d: _Draft) -> str | None:
    if d.body and not d.options and not d.answers and not d.pairs and not d.items:
        return "slide"
    if d.pairs:
        return "match"
    if d.items:
        return "order"
    if d.options:
        right = sum(ok for _, ok in d.options)
        return "multi" if right > 1 else "single"  # no * at all: an error, unless type: poll
    if d.answers:
        return "text"
    return None


def _build(d: _Draft, default_time: int, default_points: int, errors: list[str]) -> Question | None:
    where = d.where
    before = len(errors)
    text = "\n".join(d.text).strip()
    kind = (d.type or "").strip().lower() or _infer(d)
    if kind is None:
        errors.append(f"{where}: add options (* / -), answer:, pair: or item: lines")
        return None
    if kind not in TYPES:
        errors.append(f"{where}: type must be one of {', '.join(TYPES)}, got {kind!r}")
        return None
    if not text:
        errors.append(f"{where}: the {'slide title' if kind == 'slide' else 'question text'} is empty")
    if len(text) > MAX_TEXT:
        errors.append(f"{where}: the text is longer than {MAX_TEXT} characters")
    time_limit = (
        default_time if d.time in (None, "") else _int(d.time, MIN_TIME, MAX_TIME, "time", where, errors)
    )
    points = (
        default_points
        if d.points in (None, "")
        else _int(d.points, MIN_POINTS, MAX_POINTS, "points", where, errors)
    )
    if kind in ("poll", "slide"):
        points = 0
    q = Question(text=text, type=kind, time_limit=time_limit or default_time, points=points or 0)  # type: ignore[arg-type]
    q.explain = "\n".join(d.explain).strip()[:MAX_TEXT]
    q.body = "\n".join(d.body).strip()
    if len(q.body) > MAX_BODY:
        errors.append(f"{where}: the slide body is longer than {MAX_BODY} characters")

    if kind in ("single", "multi", "poll"):
        if not 2 <= len(d.options) <= MAX_OPTIONS:
            errors.append(f"{where}: needs 2-{MAX_OPTIONS} options, got {len(d.options)}")
        q.options = [label.strip() for label, _ in d.options]
        q.correct = [i for i, (_, ok) in enumerate(d.options) if ok] if kind != "poll" else []
        if any(len(o) > MAX_OPTION or not o for o in q.options):
            errors.append(f"{where}: every option needs 1-{MAX_OPTION} characters")
        if kind == "single" and len(q.correct) != 1:
            errors.append(
                f"{where}: mark exactly one correct option with * (or set type: poll for no right answer)"
            )
        if kind == "multi" and not q.correct:
            errors.append(f"{where}: mark at least one correct option")
    elif kind == "truefalse":
        q.options = ["True", "False"]
        values = [a.strip().lower() for a in d.answers] or [
            label.strip().lower() for label, ok in d.options if ok
        ]
        if len(values) != 1 or values[0] not in ("true", "false"):
            errors.append(f"{where}: a true/false question needs answer: true or answer: false")
        else:
            q.correct = [0 if values[0] == "true" else 1]
    elif kind == "text":
        if not 1 <= len([a for a in d.answers if a.strip()]) <= MAX_ANSWERS:
            errors.append(f"{where}: needs 1-{MAX_ANSWERS} accepted answers")
        for raw in d.answers:
            answer = _text_answer(raw, where, errors)
            if answer is not None:
                q.answers.append(answer)
    elif kind == "match":
        for raw in d.pairs:
            left, sep, right = raw.partition("=")
            if not sep or not left.strip() or not right.strip():
                errors.append(f"{where}: pairs look like 'left = right', got {raw.strip()!r}")
                continue
            q.pairs.append((left.strip()[:MAX_OPTION], right.strip()[:MAX_OPTION]))
        if not 2 <= len(q.pairs) <= MAX_PAIRS:
            errors.append(f"{where}: needs 2-{MAX_PAIRS} pairs, got {len(q.pairs)}")
        rights = [normalise(r) for _, r in q.pairs]
        if len(set(rights)) != len(rights):
            errors.append(f"{where}: the right-hand sides of pairs must all differ")
    elif kind == "order":
        q.items = [i.strip()[:MAX_OPTION] for i in d.items if i.strip()]
        if not 2 <= len(q.items) <= MAX_ITEMS:
            errors.append(f"{where}: needs 2-{MAX_ITEMS} items, got {len(q.items)}")
        if len({normalise(i) for i in q.items}) != len(q.items):
            errors.append(f"{where}: items to order must all differ")
    return q if len(errors) == before else None


def _finish(title: str, drafts: list[_Draft], time: int, points: int, errors: list[str]) -> Quiz:
    if not drafts:
        errors.append("no questions found: add at least one item")
    if len(drafts) > MAX_QUESTIONS:
        errors.append(f"at most {MAX_QUESTIONS} items, got {len(drafts)}")
    questions = [q for d in drafts[:MAX_QUESTIONS] if (q := _build(d, time, points, errors)) is not None]
    if errors:
        raise QuizFormatError(errors[:50])
    return Quiz(title=(title.strip() or "Live quiz")[:MAX_TITLE], questions=questions)


def parse_quiz(source: str) -> Quiz:
    """Parse the text format; raise QuizFormatError listing every problem found."""
    if len(source) > MAX_SOURCE_CHARS:
        raise QuizFormatError([f"the file is longer than {MAX_SOURCE_CHARS} characters"])
    errors: list[str] = []
    title = ""
    default_time, default_points = DEFAULT_TIME, DEFAULT_POINTS
    drafts: list[_Draft] = []
    current: _Draft | None = None
    last_key: str | None = None

    for number, raw_line in enumerate(source.replace("\r\n", "\n").replace("\r", "\n").split("\n"), start=1):
        line = raw_line.strip()
        if not line:
            if last_key == "text" and current is not None and current.type == "slide":
                current.body.append("")  # keep paragraphs in a slide body
            continue
        if line.startswith("#"):
            continue
        if (s := _SLIDE.match(line)) is not None:
            current = _Draft(where=f"slide on line {number}", text=[s.group(1).strip()], type="slide")
            drafts.append(current)
            last_key = "text"
            continue
        if (q := _Q.match(line)) is not None:
            text = q.group(1).strip()
            current = _Draft(where=f"question on line {number}", text=[text] if text else [])
            drafts.append(current)
            last_key = "text"
            continue
        if (
            current is not None
            and current.type != "slide"
            and (line[:2] in ("* ", "- ") or line in ("*", "-"))
        ):
            current.options.append((line[1:].strip(), line[0] == "*"))
            last_key = None
            continue
        key = _KEY.match(line)
        if key is not None:
            name, value = key.group(1).lower(), key.group(2)
            if current is None:
                if name == "title":
                    title = value.strip()
                elif name == "time":
                    default_time = (
                        _int(value, MIN_TIME, MAX_TIME, "time", f"line {number}", errors) or DEFAULT_TIME
                    )
                elif name == "points":
                    parsed = _int(value, MIN_POINTS, MAX_POINTS, "points", f"line {number}", errors)
                    default_points = DEFAULT_POINTS if parsed is None else parsed
                else:
                    errors.append(f"line {number}: {name}: appears before the first Q:")
                continue
            if name == "title":
                errors.append(f"line {number}: title: belongs at the top of the file")
            elif name in ("type", "time", "points"):
                setattr(current, name, value)
            elif name == "answer":
                current.answers.append(value)
            elif name == "pair":
                current.pairs.append(value)
            elif name == "item":
                current.items.append(value)
            elif name == "explain":
                current.explain.append(value.strip())
            last_key = name
            continue
        if current is None:
            errors.append(f"line {number}: an item must start with Q: or Slide:")
            continue
        if current.type == "slide" and last_key == "text":
            current.body.append(line)
            continue
        if last_key in ("text", "explain"):
            (current.text if last_key == "text" else current.explain).append(line)
            continue
        errors.append(f"line {number}: not understood: {line[:60]!r}")

    for d in drafts:  # trim the blank lines kept for slide paragraphs
        while d.body and not d.body[-1]:
            d.body.pop()
    return _finish(title, drafts, default_time, default_points, errors)


# -- JSON (the builder) -------------------------------------------------------------------------
def _str(value: Any, limit: int = MAX_BODY) -> str:
    return value[:limit] if isinstance(value, str) else ""


def quiz_from_json(data: Any) -> Quiz:
    """The builder's JSON: {title, time?, points?, items: [{type, text, ...}]}."""
    if not isinstance(data, dict):
        raise QuizFormatError(["the quiz must be a JSON object"])
    errors: list[str] = []
    default_time = DEFAULT_TIME
    default_points = DEFAULT_POINTS
    if data.get("time") not in (None, ""):
        default_time = _int(data["time"], MIN_TIME, MAX_TIME, "time", "quiz", errors) or DEFAULT_TIME
    if data.get("points") not in (None, ""):
        parsed = _int(data["points"], MIN_POINTS, MAX_POINTS, "points", "quiz", errors)
        default_points = DEFAULT_POINTS if parsed is None else parsed
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        raise QuizFormatError(["items must be a list"])
    drafts: list[_Draft] = []
    for n, item in enumerate(raw_items[: MAX_QUESTIONS + 1], start=1):
        if not isinstance(item, dict):
            errors.append(f"item {n}: must be an object")
            continue
        d = _Draft(
            where=f"item {n}",
            text=[_str(item.get("text"), MAX_TEXT + 1)],
            type=_str(item.get("type"), 20) or None,
        )
        d.time = None if item.get("time") in (None, "") else str(item.get("time"))
        d.points = None if item.get("points") in (None, "") else str(item.get("points"))
        for opt in item.get("options") or []:
            if isinstance(opt, dict):
                d.options.append((_str(opt.get("text"), MAX_OPTION + 1), bool(opt.get("correct"))))
        d.answers = [_str(a, MAX_OPTION) for a in item.get("answers") or [] if isinstance(a, str)]
        if d.type == "truefalse" and isinstance(item.get("answer"), bool):
            d.answers = ["true" if item["answer"] else "false"]
        for pair in item.get("pairs") or []:
            if isinstance(pair, list | tuple) and len(pair) == 2:
                left, right = _str(pair[0], MAX_OPTION), _str(pair[1], MAX_OPTION)
                d.pairs.append(f"{left.replace('=', ' ')} = {right}")
        d.items = [_str(i, MAX_OPTION) for i in item.get("items") or [] if isinstance(i, str)]
        d.body = [_str(item.get("body"), MAX_BODY + 1)] if item.get("body") else []
        d.explain = [_str(item.get("explain"), MAX_TEXT)] if item.get("explain") else []
        drafts.append(d)
    return _finish(_str(data.get("title"), MAX_TITLE), drafts, default_time, default_points, errors)


def quiz_to_json(quiz: Quiz) -> dict[str, Any]:
    """The editor form of a quiz (what `quiz_from_json` reads)."""
    items: list[dict[str, Any]] = []
    for q in quiz.questions:
        item: dict[str, Any] = {"type": q.type, "text": q.text, "time": q.time_limit, "points": q.points}
        if q.type in ("single", "multi", "poll"):
            item["options"] = [{"text": o, "correct": i in q.correct} for i, o in enumerate(q.options)]
        elif q.type == "truefalse":
            item["answer"] = q.correct == [0]
        elif q.type == "text":
            item["answers"] = [a.raw for a in q.answers]
        elif q.type == "match":
            item["pairs"] = [[left, right] for left, right in q.pairs]
        elif q.type == "order":
            item["items"] = list(q.items)
        elif q.type == "slide":
            item["body"] = q.body
        if q.explain:
            item["explain"] = q.explain
        items.append(item)
    return {"title": quiz.title, "items": items}


def answer_text(q: Question) -> str:
    """The right answer in words (flashcards, results)."""
    if q.type in ("single", "multi", "truefalse"):
        return " · ".join(q.options[i] for i in q.correct)
    if q.type == "text":
        plain = [a.raw for a in q.answers if a.pattern is None]
        return " / ".join(plain or [a.raw for a in q.answers])
    if q.type == "match":
        return " · ".join(f"{left} → {right}" for left, right in q.pairs)
    if q.type == "order":
        return " → ".join(q.items)
    if q.type == "slide":
        return q.body
    return ""


TEMPLATE = """title: Networking basics
time: 20
points: 1000

# A slide is a content screen: the title, then the body on the lines below it.
Slide: How a browser reaches a website
A name like example.com is turned into an IP address by DNS.
The browser then opens a TCP connection (port 443 for HTTPS) and speaks TLS on top.

# "*" marks a correct option, "-" a wrong one. One correct option = single answer.
Q: Which port does HTTPS use by default?
- 80
* 443
- 22

# Two or more correct options = multiple choice (players must pick all of them).
Q: Pick the private IPv4 ranges
* 10.0.0.0/8
* 192.168.0.0/16
- 8.8.8.0/24

# Typed answer: plain text (case and extra spaces ignored) or a /regex/ (i = ignore case).
Q: What turns a domain name into an IP address? (3 letters)
answer: DNS
answer: /^d\\.?n\\.?s\\.?$/i
time: 30

Q: TLS is a transport-layer protocol.
type: truefalse
answer: false
explain: TLS runs on top of TCP; it is usually placed at the session/presentation layer.

# Match the following: players drag each right-hand item next to its partner.
Q: Match the protocol to its port
pair: SSH = 22
pair: DNS = 53
pair: HTTPS = 443
points: 2000

# Put in order: list the items in the correct order; players see them shuffled.
Q: Put the TCP handshake in order
item: SYN
item: SYN-ACK
item: ACK

# A poll has options without a right answer and gives no points.
Q: How confident are you with networking?
type: poll
- Very
- Somewhat
- Not yet
"""

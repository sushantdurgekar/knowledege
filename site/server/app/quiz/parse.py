"""The quiz import format: plain text, one question per block (see TEMPLATE below).

Keys: `title:`, `time:` (seconds, 5-300) and `points:` at the top set the defaults; each
question starts with `Q:` and may set `type:` (single, multi, text, match, truefalse; inferred
when left out), `time:`, `points:` and `explain:`. Options are `* correct` / `- wrong` lines,
text answers are `answer:` lines (plain text, or `/regex/` or `/regex/i`, matched in full),
match questions are `pair: left = right` lines. Lines starting with `#` are comments; a
question's text may continue on the lines after `Q:`.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

QuestionType = Literal["single", "multi", "text", "match", "truefalse"]
TYPES: tuple[QuestionType, ...] = ("single", "multi", "text", "match", "truefalse")

MAX_SOURCE_CHARS = 200_000
MAX_QUESTIONS = 200
MAX_TEXT = 1_000
MAX_OPTION = 200
MAX_OPTIONS = 8
MAX_PAIRS = 8
MAX_ANSWERS = 20
MIN_TIME, MAX_TIME, DEFAULT_TIME = 5, 300, 20
MIN_POINTS, MAX_POINTS, DEFAULT_POINTS = 0, 5000, 1000

_KEY = re.compile(r"^(title|time|points|type|answer|pair|explain)\s*:\s*(.*)$", re.IGNORECASE)
_Q = re.compile(r"^(?:q|question)\s*\d*\s*[:.)]\s*(.*)$", re.IGNORECASE)
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
        text = normalise(value)
        if self.pattern is not None:
            return self.pattern.fullmatch(value.strip()) is not None
        return text == normalise(self.raw)


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
    explain: str = ""


@dataclass(slots=True)
class Quiz:
    title: str
    questions: list[Question]


def normalise(value: str) -> str:
    return " ".join(value.split()).casefold()


@dataclass(slots=True)
class _Draft:
    line: int
    text: list[str] = field(default_factory=list)
    type: str | None = None
    time: str | None = None
    points: str | None = None
    options: list[tuple[str, bool]] = field(default_factory=list)
    answers: list[str] = field(default_factory=list)
    pairs: list[str] = field(default_factory=list)
    explain: list[str] = field(default_factory=list)


def _int(value: str, low: int, high: int, what: str, where: str, errors: list[str]) -> int | None:
    try:
        number = int(value.strip())
    except ValueError:
        errors.append(f"{where}: {what} must be a whole number, got {value.strip()!r}")
        return None
    if not low <= number <= high:
        errors.append(f"{where}: {what} must be {low}-{high}, got {number}")
        return None
    return number


def _text_answer(raw: str, where: str, errors: list[str]) -> TextAnswer | None:
    raw = raw.strip()
    found = _REGEX.match(raw)
    if found is None:
        return TextAnswer(raw) if raw else None
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


def _build(d: _Draft, default_time: int, default_points: int, errors: list[str]) -> Question | None:
    where = f"question on line {d.line}"
    before = len(errors)
    text = "\n".join(d.text).strip()
    if not text:
        errors.append(f"{where}: the question text is empty")
    if len(text) > MAX_TEXT:
        errors.append(f"{where}: the question text is longer than {MAX_TEXT} characters")
    time_limit = default_time if d.time is None else _int(d.time, MIN_TIME, MAX_TIME, "time", where, errors)
    points = (
        default_points
        if d.points is None
        else _int(d.points, MIN_POINTS, MAX_POINTS, "points", where, errors)
    )

    kind = (d.type or "").strip().lower()
    if kind and kind not in TYPES:
        errors.append(f"{where}: type must be one of {', '.join(TYPES)}, got {kind!r}")
        return None
    if not kind:
        if d.pairs:
            kind = "match"
        elif d.options:
            kind = "single" if sum(ok for _, ok in d.options) == 1 else "multi"
        elif d.answers:
            kind = "text"
        else:
            errors.append(f"{where}: add options (* / -), answer: lines or pair: lines")
            return None
    q = Question(text=text, type=kind, time_limit=time_limit or default_time, points=points or 0)  # type: ignore[arg-type]
    if points == 0 and d.points is not None:
        q.points = 0
    q.explain = "\n".join(d.explain).strip()[:MAX_TEXT]

    if kind in ("single", "multi"):
        if d.answers or d.pairs:
            errors.append(f"{where}: a {kind} question takes only * / - option lines")
        if not 2 <= len(d.options) <= MAX_OPTIONS:
            errors.append(f"{where}: needs 2-{MAX_OPTIONS} options, got {len(d.options)}")
        q.options = [label for label, _ in d.options]
        q.correct = [i for i, (_, ok) in enumerate(d.options) if ok]
        if any(len(o) > MAX_OPTION or not o for o in q.options):
            errors.append(f"{where}: options must be 1-{MAX_OPTION} characters")
        if kind == "single" and len(q.correct) != 1:
            errors.append(f"{where}: a single-answer question needs exactly one * option")
        if kind == "multi" and not q.correct:
            errors.append(f"{where}: mark at least one correct option with *")
    elif kind == "truefalse":
        q.options = ["True", "False"]
        values = [a.strip().lower() for a in d.answers]
        if d.options:
            labels = [label.strip().lower() for label, ok in d.options if ok]
            values = values or labels
        if len(values) != 1 or values[0] not in ("true", "false"):
            errors.append(f"{where}: a truefalse question needs answer: true or answer: false")
        else:
            q.correct = [0 if values[0] == "true" else 1]
    elif kind == "text":
        if not 1 <= len(d.answers) <= MAX_ANSWERS:
            errors.append(f"{where}: needs 1-{MAX_ANSWERS} answer: lines")
        for raw in d.answers:
            answer = _text_answer(raw, where, errors)
            if answer is not None:
                q.answers.append(answer)
    elif kind == "match":
        for raw in d.pairs:
            left, sep, right = raw.partition("=")
            if not sep or not left.strip() or not right.strip():
                errors.append(f"{where}: pair lines look like 'pair: left = right', got {raw.strip()!r}")
                continue
            q.pairs.append((left.strip()[:MAX_OPTION], right.strip()[:MAX_OPTION]))
        if not 2 <= len(q.pairs) <= MAX_PAIRS:
            errors.append(f"{where}: needs 2-{MAX_PAIRS} pair: lines, got {len(q.pairs)}")
        rights = [normalise(r) for _, r in q.pairs]
        if len(set(rights)) != len(rights):
            errors.append(f"{where}: the right-hand sides of pairs must all differ")
    return q if len(errors) == before else None


def parse_quiz(source: str) -> Quiz:
    """Parse the import format; raise QuizFormatError listing every problem found."""
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
        if not line or line.startswith("#"):
            last_key = None if not line else last_key
            continue
        if (q := _Q.match(line)) is not None:
            text = q.group(1)
            current = _Draft(line=number, text=[text.strip()] if text.strip() else [])
            drafts.append(current)
            last_key = "text"
            continue
        if line[:2] in ("* ", "- ") or line in ("*", "-"):
            if current is None:
                errors.append(f"line {number}: an option appears before the first Q:")
                continue
            current.options.append((line[1:].strip(), line[0] == "*"))
            last_key = None
            continue
        key = _KEY.match(line)
        if key is not None:
            name, value = key.group(1).lower(), key.group(2)
            if current is None:
                if name == "title":
                    title = value.strip()[:200]
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
            elif name == "explain":
                current.explain.append(value.strip())
            last_key = name
            continue
        if current is not None and last_key in ("text", "explain"):
            (current.text if last_key == "text" else current.explain).append(line)
            continue
        errors.append(f"line {number}: not understood: {line[:60]!r}")

    if not drafts:
        errors.append("no questions found: start each question with a line 'Q: ...'")
    if len(drafts) > MAX_QUESTIONS:
        errors.append(f"at most {MAX_QUESTIONS} questions, got {len(drafts)}")
    questions = [q for d in drafts if (q := _build(d, default_time, default_points, errors)) is not None]
    if errors:
        raise QuizFormatError(errors[:50])
    return Quiz(title=title or "Live quiz", questions=questions)


TEMPLATE = """title: Networking basics
time: 20
points: 1000

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
Q: What is the capital of France?
answer: Paris
answer: /^paris( city)?$/i
time: 30

Q: TLS is a transport-layer protocol.
type: truefalse
answer: false

# Match the following: players pair each left item with a right item.
Q: Match the protocol to its port
pair: SSH = 22
pair: DNS = 53
pair: HTTPS = 443
points: 2000
explain: SSH 22, DNS 53, HTTPS 443.
"""

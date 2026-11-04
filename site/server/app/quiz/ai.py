"""AI-drafted quiz questions (optional): a hub module's key points or pasted notes -> draft items.

Enabled only when ANTHROPIC_API_KEY is set on the server. The admin always reviews drafts in
the editor before hosting; nothing is published straight from the model.

Model and request (claude-api skill guidance):
- claude-opus-5-5 at effort "medium" (set explicitly; thinking is always on for this model).
- output_config.format with a JSON schema, so the reply is one JSON object to validate.
- Server-side refusal fallbacks (`fallbacks: "default"`, beta server-side-fallback-2026-07-01):
  a declined request is re-run on Anthropic's recommended fallback model in the same call.
- Every drafted item goes through quiz_from_json, the same validation hand-made quizzes get;
  items that fail it are dropped and counted.

Cost: about $4 / $20 per million input / output tokens. A draft of ~8 questions from one
module reads a few thousand tokens and writes a few thousand (thinking included): a few cents.
Usage is logged per request; drafts are rate-limited per admin in the route.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import anthropic

from app.quiz.parse import QuizFormatError, quiz_from_json

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"
EFFORT = "medium"
MAX_TOKENS = 16000
MAX_SOURCE_CHARS = 30_000
FALLBACK_BETA = "server-side-fallback-2026-07-01"
KINDS = ("single", "multi", "truefalse", "text")

SYSTEM = """You write quiz questions for a study platform used by working professionals \
preparing for technical certifications and interviews.

Write questions that check understanding and application, not recall of trivia: prefer short \
scenarios ("A team needs X; which approach fits best?") and "why" or "what happens if" questions. \
Every question must be answerable from the source material alone.

For multiple-choice questions, the wrong options must be plausible: base them on real \
misconceptions or near-miss alternatives, never on obviously silly answers. Keep options \
similar in length and style so the right one does not stand out. Exactly one option is \
correct for "single"; two or more for "multi". For "truefalse", write a statement that is \
clearly true or false. For "text", the answer must be one short term (1-3 words) and you list \
the accepted spellings.

The explanation says in one or two sentences why the right answer is right and, when useful, \
why the most tempting wrong option is wrong. When hints are requested, write one hint that \
narrows the problem without giving the answer away.

Write in plain text: no Markdown, no HTML. Questions under 300 characters, options under 120."""


def _schema(with_hints: bool) -> dict[str, Any]:
    question: dict[str, Any] = {
        "type": "object",
        "properties": {
            "type": {"type": "string", "enum": list(KINDS)},
            "text": {"type": "string"},
            "options": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}, "correct": {"type": "boolean"}},
                    "required": ["text", "correct"],
                    "additionalProperties": False,
                },
            },
            "answer": {"type": "boolean"},
            "answers": {"type": "array", "items": {"type": "string"}},
            "explain": {"type": "string"},
        },
        "required": ["type", "text", "options", "answer", "answers", "explain"],
        "additionalProperties": False,
    }
    if with_hints:
        question["properties"]["hint"] = {"type": "string"}
        question["required"].append("hint")
    return {
        "type": "object",
        "properties": {"questions": {"type": "array", "items": question}},
        "required": ["questions"],
        "additionalProperties": False,
    }


class AiError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def enabled() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


_client: anthropic.AsyncAnthropic | None = None


def client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        # Reads ANTHROPIC_API_KEY from the environment; 2 automatic retries on 429/5xx.
        _client = anthropic.AsyncAnthropic(timeout=180.0, max_retries=2)
    return _client


def _prompt(source: str, count: int, kinds: list[str], advanced: bool, avoid: list[str]) -> str:
    parts = [
        f"Write {count} quiz questions from the source material below.",
        f"Use these question types, mixed: {', '.join(kinds)}.",
        "For each question fill every field: use an empty options list for truefalse and text, "
        "answer (true/false) only matters for truefalse, answers (accepted spellings) only for text.",
    ]
    if advanced:
        parts.append("Include one hint per question.")
    if avoid:
        parts.append(
            "The quiz already has these questions; do not repeat them or ask the same thing:\n"
            + "\n".join(f"- {q}" for q in avoid[:40])
        )
    parts.append(f"<source>\n{source[:MAX_SOURCE_CHARS]}\n</source>")
    return "\n\n".join(parts)


def _to_items(raw: list[dict[str, Any]], advanced: bool) -> tuple[list[dict[str, Any]], int]:
    """The model's questions as builder items; each validated alone (bad ones are dropped)."""
    items: list[dict[str, Any]] = []
    dropped = 0
    for q in raw:
        kind = q.get("type")
        item: dict[str, Any] = {"type": kind, "text": str(q.get("text", "")).strip()}
        if kind in ("single", "multi"):
            item["options"] = [
                {"text": str(o.get("text", "")).strip(), "correct": bool(o.get("correct"))}
                for o in q.get("options") or []
                if isinstance(o, dict)
            ]
        elif kind == "truefalse":
            item["answer"] = bool(q.get("answer"))
        elif kind == "text":
            item["answers"] = [str(a).strip() for a in q.get("answers") or [] if str(a).strip()]
        if str(q.get("explain", "")).strip():
            item["explain"] = str(q["explain"]).strip()
        if advanced and str(q.get("hint", "")).strip():
            item["hints"] = [str(q["hint"]).strip()]
        try:
            quiz_from_json({"title": "draft", "advanced": advanced, "items": [item]})
        except QuizFormatError:
            dropped += 1
            continue
        items.append(item)
    return items, dropped


async def draft(
    source: str, *, count: int, kinds: list[str], advanced: bool, avoid: list[str]
) -> dict[str, Any]:
    if not enabled():
        raise AiError(503, "ai_disabled", "AI drafting is not set up on this server (ANTHROPIC_API_KEY)")
    try:
        response = await client().beta.messages.create(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            system=SYSTEM,
            messages=[{"role": "user", "content": _prompt(source, count, kinds, advanced, avoid)}],
            output_config={"effort": EFFORT, "format": {"type": "json_schema", "schema": _schema(advanced)}},
            betas=[FALLBACK_BETA],
            fallbacks="default",
        )
    except anthropic.AuthenticationError:
        raise AiError(503, "ai_misconfigured", "The server's Anthropic API key was rejected") from None
    except anthropic.PermissionDeniedError:
        raise AiError(
            503, "ai_misconfigured", "The server's Anthropic API key cannot use this model"
        ) from None
    except anthropic.RateLimitError:
        raise AiError(429, "rate_limited", "The AI service is busy; try again in a minute") from None
    except anthropic.BadRequestError as exc:
        logger.warning("AI draft rejected: %s", exc.message)
        raise AiError(422, "ai_bad_request", "The AI service could not take this request") from None
    except anthropic.APIStatusError as exc:
        logger.warning("AI draft failed: HTTP %s", exc.status_code)
        raise AiError(503, "ai_unavailable", "The AI service is unavailable right now") from None
    except anthropic.APIConnectionError:
        raise AiError(503, "ai_unavailable", "Could not reach the AI service") from None

    usage = response.usage
    logger.info(
        "AI draft: model=%s in=%s out=%s stop=%s request=%s",
        response.model,
        usage.input_tokens,
        usage.output_tokens,
        response.stop_reason,
        response._request_id,
    )
    if response.stop_reason == "refusal":
        raise AiError(422, "ai_declined", "The AI declined this material; try other notes")
    if response.stop_reason == "max_tokens":
        raise AiError(422, "ai_too_long", "The draft was cut off; ask for fewer questions")
    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        data = json.loads(text)
    except ValueError:
        raise AiError(502, "ai_bad_output", "The AI reply was not valid JSON; try again") from None
    raw = data.get("questions") if isinstance(data, dict) else None
    items, dropped = _to_items([q for q in raw or [] if isinstance(q, dict)], advanced)
    return {
        "items": items,
        "dropped": dropped,
        "model": response.model,
        "usage": {"input": usage.input_tokens, "output": usage.output_tokens},
    }


def source_from_bank(hub: dict[str, Any], module_ids: list[str]) -> tuple[str, list[str]]:
    """Key points of the chosen modules as source; their existing questions as 'avoid'."""
    parts: list[str] = []
    avoid: list[str] = []
    for m in hub.get("modules") or []:
        if m.get("id") not in module_ids:
            continue
        parts.append(f"## {m.get('title')}\n" + "\n".join(f"- {k}" for k in m.get("keys") or []))
        avoid.extend(q.get("q", "") for q in m.get("quiz") or [])
    return "\n\n".join(parts), avoid

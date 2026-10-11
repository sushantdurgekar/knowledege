"""Small self-contained HTML pages the server renders itself (404 hub, 503 states).

They must work when the React build or the hub build is missing, so they use no
scripts, no external assets and a locked-down CSP. Nothing from the request is
echoed into them.
"""

from __future__ import annotations

from html import escape

from starlette.responses import HTMLResponse, PlainTextResponse

PAGE_CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; "
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
)
RETRY_AFTER_SECONDS = 60

_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{title} · Study Hubs</title>
<style>
:root {{ --bg: #f7f6f2; --fg: #1d1d1f; --muted: #5b5b66; --card: #ffffff; --line: #e3e1da;
  --accent: #2343c4; }}
@media (prefers-color-scheme: dark) {{
  :root {{ --bg: #121216; --fg: #ececf1; --muted: #a3a3b2; --card: #1c1c22; --line: #2c2c35;
    --accent: #8ea2ff; }}
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px;
  background: var(--bg); color: var(--fg);
  font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }}
main {{ max-width: 34rem; width: 100%; background: var(--card); border: 1px solid var(--line);
  border-radius: 16px; padding: 28px 24px; }}
.code {{ font: 600 13px/1 ui-monospace, "SFMono-Regular", Menlo, monospace; color: var(--muted);
  letter-spacing: .08em; }}
h1 {{ font-size: 1.5rem; line-height: 1.25; margin: 10px 0 8px; }}
p {{ margin: 0 0 20px; color: var(--muted); }}
a {{ color: var(--accent); font-weight: 600; text-decoration: none; }}
a:hover, a:focus-visible {{ text-decoration: underline; }}
</style>
</head>
<body>
<main>
<div class="code">{status}</div>
<h1>{heading}</h1>
<p>{message}</p>
<a href="/">&larr; All hubs</a>
</main>
</body>
</html>
"""


def html_page(
    status_code: int,
    heading: str,
    message: str,
    *,
    title: str | None = None,
    retry_after: int | None = None,
) -> HTMLResponse:
    body = _TEMPLATE.format(
        status=status_code,
        title=escape(title or heading),
        heading=escape(heading),
        message=escape(message),
    )
    headers = {"Cache-Control": "no-store", "Content-Security-Policy": PAGE_CSP}
    if retry_after is not None:
        headers["Retry-After"] = str(retry_after)
    return HTMLResponse(body, status_code=status_code, headers=headers)


def hub_not_found() -> HTMLResponse:
    return html_page(
        404,
        "Hub not found",
        "That study hub doesn't exist or has moved. Pick one from the full list.",
    )


def hubs_unavailable() -> HTMLResponse:
    return html_page(
        503,
        "Hubs are being prepared",
        "The study hubs aren't available right now. Please try again in a minute.",
        retry_after=RETRY_AFTER_SECONDS,
    )


def shell_unavailable() -> HTMLResponse:
    return html_page(
        503,
        "Study Hubs is updating",
        "This page isn't available right now. Please try again in a minute.",
        retry_after=RETRY_AFTER_SECONDS,
    )


def build_unavailable() -> HTMLResponse:
    """A file listed at startup disappeared (the build was replaced under a running server)."""
    return html_page(
        503,
        "Study Hubs is updating",
        "This file is being rebuilt. Please try again in a minute.",
        retry_after=RETRY_AFTER_SECONDS,
    )


def file_not_found() -> PlainTextResponse:
    """404 for /assets and /_sh misses: plain text, so a script tag never receives HTML."""
    return PlainTextResponse("Not found\n", status_code=404, headers={"Cache-Control": "no-store"})

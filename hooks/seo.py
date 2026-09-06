"""Add accessible names to heading permalinks."""

from __future__ import annotations

import re

_HEADERLINK = re.compile(
    r'<a class="headerlink" href="(#[^"]+)" title="([^"]*)"(?: aria-label="[^"]*")?>([^<]*)</a>'
)


def _with_aria_label(match: re.Match[str]) -> str:
    href, title, text = match.group(1), match.group(2), match.group(3)
    label = title or "Link to this section"
    return (
        f'<a class="headerlink" href="{href}" title="{label}" aria-label="{label}">{text}</a>'
    )


def on_page_content(html: str, **_kwargs) -> str:
    return _HEADERLINK.sub(_with_aria_label, html)

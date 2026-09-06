# Contributing

This site is a Git repo. Technical contributors can clone it, edit Markdown,
and send a pull request. You do not need a CMS account.

Collaborators with a bearer token can also propose drafts through the MCP
server. That path always sets `draft: true` and opens a pull request. See
[mcp/README.md](./mcp/README.md). A human still merges and publishes.

## Preview

```bash
uv sync
uv run mkdocs serve
```

## Write a post

1. Add `docs/writing/posts/<slug>.md`.
2. Copy the frontmatter from [AGENTS.md](./AGENTS.md).
3. Put `<!-- more -->` after the excerpt.
4. Link the post from `docs/writing/index.md` if it should appear on Writing.
5. New authors: add an entry to `docs/writing/.authors.yml`.

Every published page has **Edit this page**, which opens the file on GitHub.

## What not to change

Leave `mkdocs.yml` and `overrides/` alone unless the change is about the site
engine, not a post.

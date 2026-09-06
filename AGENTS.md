# AGENTS.md

- Content lives in `docs/`.
- Blog posts live in `docs/writing/posts/`.
- New posts need frontmatter: `authors`, `categories`, `comments`, `date`, `description`, `draft`, `slug`, `tags`.
- Default new posts to `draft: false` unless asked for a draft.
- Use `<!-- more -->` for the excerpt break.
- Link noteworthy posts from `docs/writing/index.md`.
- New authors: pass a GitHub username in `authors`. MCP fills `docs/writing/.authors.yml` from the public profile (name, avatar, url). Manual entries still work.
- Local preview: `uv run mkdocs serve`. Local build: `uv run mkdocs build`.
- Remote MCP (Cloudflare Worker) lives in `mcp/`. Public search/get_details; writes open draft PRs.

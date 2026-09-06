# CLAUDE.md

Personal blog built with MkDocs Material. Content is Markdown in `docs/`.

```bash
uv sync
uv run mkdocs serve
uv run mkdocs build
```

- Posts: `docs/writing/posts/`
- Authors: `docs/writing/.authors.yml` (MCP can fill this from a GitHub username)
- Config: `mkdocs.yml`
- Theme overrides: `overrides/`
- Frontmatter and excerpt rules: [AGENTS.md](./AGENTS.md)

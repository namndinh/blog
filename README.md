# blog

Personal site for [Nam](https://github.com/namndinh). Markdown in `docs/`,
rendered by [Material for MkDocs](https://squidfunk.github.io/mkdocs-material/).

Live site: <https://namndinh.github.io/blog/>

The layout follows [jxnl/blog](https://github.com/jxnl/blog/) (MIT). The
writing here is new.

## Run locally

```bash
git clone https://github.com/namndinh/blog.git
cd blog
uv sync
uv run mkdocs serve
```

Then open `http://127.0.0.1:8000`.

## Add a post

Create `docs/writing/posts/your-slug.md` with the frontmatter in
[AGENTS.md](./AGENTS.md) or [How this blog works](./docs/writing/posts/how-this-blog-works.md).
Open a pull request against `main`.

## Deploy

Pushes to `main` build the site and publish it to GitHub Pages via
`.github/workflows/deploy.yml`.

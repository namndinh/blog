---
authors:
  - nam
categories:
  - Meta
comments: false
date: 2026-09-06
description: How this site is built and how to add a post by cloning the repo.
draft: false
slug: how-this-blog-works
tags:
  - contributing
  - mkdocs
---

# How this blog works

This site is a folder of Markdown files. There is no CMS. If you can use Git,
you can write here.

<!-- more -->

## Clone and preview

```bash
git clone https://github.com/namndinh/blog.git
cd blog
uv sync
uv run mkdocs serve
```

Open `http://127.0.0.1:8000`. Saving a Markdown file reloads the page.

## Add a post

1. Create `docs/writing/posts/your-slug.md`.
2. Use this frontmatter:

```yaml
---
authors:
  - nam
categories:
  - Notes
comments: false
date: 2026-09-06
description: One or two sentences for the preview and RSS feed.
draft: false
slug: your-slug
tags:
  - notes
---
```

3. Write an `#` title, then an excerpt, then `<!-- more -->`, then the rest.
4. Link the post from `docs/writing/index.md` if it should show on the Writing page.
5. If you are a new author, add yourself to `docs/writing/.authors.yml`.

## Send it back

```bash
git checkout -b your-slug
git add docs/writing/posts/your-slug.md
git commit -m "Add post: your slug"
git push -u origin HEAD
```

Open a pull request against `main`. Every page also has **Edit this page**,
which opens the file on GitHub.

## What you do not need to touch

`mkdocs.yml`, the Material theme, and `overrides/` are the site engine. Posts
live in `docs/`. Leave the engine alone unless you are changing the site
itself.

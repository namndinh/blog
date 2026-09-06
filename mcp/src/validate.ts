import { BlogError } from "./errors.js";
import type { PostFields, PostFrontmatter } from "./types.js";

export const REQUIRED_FRONTMATTER = [
  "authors",
  "categories",
  "comments",
  "date",
  "description",
  "draft",
  "slug",
  "tags",
] as const;

export const MORE_TAG = "<!-- more -->";
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function assertSlug(slug: string): string {
  const value = slug.trim();
  if (!SLUG_RE.test(value)) {
    throw new BlogError(
      "invalid_slug",
      "slug must be kebab-case (lowercase letters, digits, hyphens)",
    );
  }
  return value;
}

export function assertDate(date: string): string {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new BlogError("invalid_date", "date must be YYYY-MM-DD");
  }
  return date;
}

export function assertAuthors(authors: string[], known: Set<string>): string[] {
  if (!authors.length) {
    throw new BlogError("invalid_frontmatter", "authors must be a non-empty list");
  }
  const unknown = authors.filter((author) => !known.has(author));
  if (unknown.length) {
    throw new BlogError(
      "unknown_author",
      `Unknown author id(s): ${unknown.join(", ")}. Add them to docs/writing/.authors.yml first.`,
    );
  }
  return authors;
}

export function assertStringList(name: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new BlogError("invalid_frontmatter", `${name} must be a list of strings`);
  }
  return value.map((item) => item.trim());
}

export function validatePostFields(
  input: Partial<PostFields> & { title?: string },
  knownAuthors: Set<string>,
  options: { forceDraft: boolean; allowPublish: boolean },
): PostFields {
  const slug = assertSlug(String(input.slug ?? ""));
  const title = String(input.title ?? "").trim();
  if (!title) {
    throw new BlogError("invalid_frontmatter", "title is required");
  }
  const excerpt = String(input.excerpt ?? "").trim();
  const body = String(input.body ?? "").trim();
  if (!excerpt) {
    throw new BlogError("invalid_frontmatter", "excerpt is required");
  }
  if (!body) {
    throw new BlogError("invalid_frontmatter", "body is required");
  }
  const description = String(input.description ?? "").trim();
  if (!description) {
    throw new BlogError("invalid_frontmatter", "description is required");
  }

  let draft = Boolean(input.draft);
  if (options.forceDraft) {
    draft = true;
  } else if (input.draft === false && !options.allowPublish) {
    throw new BlogError(
      "forbidden_publish",
      "Setting draft: false requires the posts:publish scope",
    );
  }

  return {
    authors: assertAuthors(assertStringList("authors", input.authors ?? []), knownAuthors),
    categories: assertStringList("categories", input.categories ?? []),
    comments: Boolean(input.comments),
    date: assertDate(String(input.date ?? todayDate())),
    description,
    draft,
    slug,
    tags: assertStringList("tags", input.tags ?? []),
    title,
    excerpt,
    body,
  };
}

export function parseFrontmatter(markdown: string): {
  frontmatter: PostFrontmatter;
  title: string;
  excerpt: string;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown);
  if (!match) {
    throw new BlogError("invalid_frontmatter", "Post must start with YAML frontmatter");
  }
  const raw = parseSimpleYaml(match[1]);
  const rest = match[2];
  if (!rest.includes(MORE_TAG)) {
    throw new BlogError("missing_more_tag", "Post must include <!-- more --> after the excerpt");
  }
  const [beforeMore, afterMore] = rest.split(MORE_TAG);
  const titleMatch = /^#\s+(.+)\n/.exec(beforeMore.trimStart());
  if (!titleMatch) {
    throw new BlogError("invalid_frontmatter", "Post must start with an # title after frontmatter");
  }
  const excerpt = beforeMore.trimStart().slice(titleMatch[0].length).trim();
  if (!excerpt) {
    throw new BlogError("invalid_frontmatter", "Excerpt before <!-- more --> is required");
  }

  const frontmatter: PostFrontmatter = {
    authors: assertStringList("authors", raw.authors),
    categories: assertStringList("categories", raw.categories),
    comments: Boolean(raw.comments),
    date: assertDate(String(raw.date ?? "")),
    description: String(raw.description ?? "").trim(),
    draft: Boolean(raw.draft),
    slug: assertSlug(String(raw.slug ?? "")),
    tags: assertStringList("tags", raw.tags),
  };
  if (!frontmatter.description) {
    throw new BlogError("invalid_frontmatter", "description is required");
  }
  return {
    frontmatter,
    title: titleMatch[1].trim(),
    excerpt,
    body: afterMore.trim(),
  };
}

export function renderPost(fields: PostFields): string {
  return [
    "---",
    "authors:",
    ...fields.authors.map((author) => `  - ${author}`),
    "categories:",
    ...fields.categories.map((category) => `  - ${category}`),
    `comments: ${fields.comments}`,
    `date: ${fields.date}`,
    `description: ${yamlQuote(fields.description)}`,
    `draft: ${fields.draft}`,
    `slug: ${fields.slug}`,
    "tags:",
    ...fields.tags.map((tag) => `  - ${tag}`),
    "---",
    "",
    `# ${fields.title}`,
    "",
    fields.excerpt,
    "",
    MORE_TAG,
    "",
    fields.body,
    "",
  ].join("\n");
}

export function parsePostId(id: string): string {
  const trimmed = id
    .trim()
    .replace(/\/index\.html$/i, "")
    .replace(/\/+$/, "");
  const markdown = /(?:^|\/)([^/]+)\.md$/i.exec(trimmed);
  if (markdown) {
    return markdown[1];
  }
  const parts = trimmed.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last) {
    throw new BlogError("not_found", "Could not parse a post id");
  }
  return last;
}

export function parseSimpleYaml(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  const flushList = () => {
    if (currentKey && currentList) {
      result[currentKey] = currentList;
    }
    currentKey = null;
    currentList = null;
  };

  for (const rawLine of source.split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    const listItem = /^\s+-\s+(.+)$/.exec(line);
    if (listItem && currentList) {
      currentList.push(unwrapYamlScalar(listItem[1]));
      continue;
    }
    const pair = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!pair) {
      continue;
    }
    flushList();
    const [, key, value] = pair;
    if (value === "") {
      currentKey = key;
      currentList = [];
      continue;
    }
    result[key] = coerceYamlScalar(unwrapYamlScalar(value));
  }
  flushList();
  return result;
}

function unwrapYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function coerceYamlScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  return value;
}

function yamlQuote(value: string): string {
  if (/[:#\n]|^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

export function validationReport(fields: PostFields): Record<string, unknown> {
  return {
    file: `docs/writing/posts/${fields.slug}.md`,
    slug: fields.slug,
    title: fields.title,
    draft: fields.draft,
    date: fields.date,
    authors: fields.authors,
    has_more_tag: true,
  };
}

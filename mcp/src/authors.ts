import type { AuthorInfo } from "./types.js";

export const AUTHORS_PATH = "docs/writing/.authors.yml";
export const WRITING_INDEX_PATH = "docs/writing/index.md";

export function parseAuthorsYaml(source: string): AuthorInfo[] {
  const authors: AuthorInfo[] = [];
  let current: AuthorInfo | null = null;
  let inAuthors = false;

  const flush = () => {
    if (current) {
      authors.push(current);
    }
    current = null;
  };

  for (const raw of source.split("\n")) {
    if (/^authors:\s*$/.test(raw)) {
      inAuthors = true;
      continue;
    }
    if (!inAuthors) {
      continue;
    }
    const idMatch = /^  ([A-Za-z0-9_-]+):\s*$/.exec(raw);
    if (idMatch) {
      flush();
      current = { id: idMatch[1], name: idMatch[1] };
      continue;
    }
    const field = /^    ([A-Za-z0-9_]+):\s*(.+)$/.exec(raw);
    if (field && current) {
      const value = unwrap(field[2]);
      if (field[1] === "name") current.name = value;
      if (field[1] === "description") current.description = value;
      if (field[1] === "url") current.url = value;
    }
  }
  flush();
  return authors;
}

export function knownAuthorIds(authors: AuthorInfo[]): Set<string> {
  return new Set(authors.map((author) => author.id));
}

export function appendWritingIndexLink(
  indexMarkdown: string,
  title: string,
  slug: string,
  description: string,
): string {
  const bullet = `- [${title}](./posts/${slug}.md) — ${description}`;
  if (indexMarkdown.includes(`./posts/${slug}.md`)) {
    return indexMarkdown;
  }
  return `${indexMarkdown.replace(/\s*$/, "\n")}${bullet}\n`;
}

function unwrap(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

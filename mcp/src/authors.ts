import { BlogError } from "./errors.js";
import type { AuthorInfo, GitHubUserProfile } from "./types.js";

export const AUTHORS_PATH = "docs/writing/.authors.yml";
export const WRITING_INDEX_PATH = "docs/writing/index.md";
export const GITHUB_LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

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
      if (field[1] === "avatar") current.avatar = value;
      if (field[1] === "url") current.url = value;
    }
  }
  flush();
  return authors;
}

export function renderAuthorsYaml(authors: AuthorInfo[]): string {
  const lines = ["authors:"];
  for (const author of authors) {
    lines.push(`  ${author.id}:`);
    lines.push(`    name: ${yamlQuote(author.name)}`);
    if (author.description) lines.push(`    description: ${yamlQuote(author.description)}`);
    if (author.avatar) lines.push(`    avatar: ${yamlQuote(author.avatar)}`);
    if (author.url) lines.push(`    url: ${yamlQuote(author.url)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function knownAuthorIds(authors: AuthorInfo[]): Set<string> {
  return new Set(authors.map((author) => author.id));
}

export function githubLoginFromUrl(url?: string): string | null {
  if (!url) {
    return null;
  }
  const match = /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/?$/i.exec(url.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function findAuthor(authors: AuthorInfo[], value: string): AuthorInfo | undefined {
  const needle = value.trim().toLowerCase();
  return authors.find(
    (author) =>
      author.id.toLowerCase() === needle || githubLoginFromUrl(author.url) === needle,
  );
}

export function profileToAuthor(profile: GitHubUserProfile): AuthorInfo {
  const login = profile.login.trim();
  return {
    id: login.toLowerCase(),
    name: oneLine(profile.name) || login,
    description: oneLine(profile.bio),
    avatar: profile.avatar_url,
    url: profile.html_url,
  };
}

export async function resolveAuthorIds(
  requested: string[],
  existing: AuthorInfo[],
  getUser: (login: string) => Promise<GitHubUserProfile>,
): Promise<{ ids: string[]; added: AuthorInfo[]; catalog: AuthorInfo[] }> {
  if (!requested.length) {
    throw new BlogError("invalid_frontmatter", "authors must be a non-empty list");
  }

  const catalog = [...existing];
  const ids: string[] = [];
  const added: AuthorInfo[] = [];
  const unknown: string[] = [];

  for (const raw of requested) {
    const value = raw.trim();
    const match = findAuthor(catalog, value);
    if (match) {
      if (!ids.includes(match.id)) {
        ids.push(match.id);
      }
      continue;
    }
    if (!GITHUB_LOGIN_RE.test(value)) {
      unknown.push(value);
      continue;
    }
    try {
      const author = profileToAuthor(await getUser(value));
      const again = findAuthor(catalog, author.id);
      if (again) {
        if (!ids.includes(again.id)) {
          ids.push(again.id);
        }
        continue;
      }
      catalog.push(author);
      added.push(author);
      ids.push(author.id);
    } catch (error) {
      if (error instanceof BlogError && error.code === "not_found") {
        unknown.push(value);
        continue;
      }
      throw error;
    }
  }

  if (unknown.length) {
    throw new BlogError(
      "unknown_author",
      `Not a known author id or GitHub user: ${unknown.join(", ")}`,
    );
  }

  return { ids, added, catalog };
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

function yamlQuote(value: string): string {
  if (value === "" || /[#\n]|^\s|\s$|^[-?:,[\]{}&*!|>'"%@`]/.test(value) || /: /.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

function oneLine(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const line = value.replace(/\s+/g, " ").trim();
  return line ? line.slice(0, 200) : undefined;
}

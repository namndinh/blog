import { BlogError } from "./errors.js";
import type { SearchHit } from "./types.js";

interface SearchDoc {
  location?: string;
  title?: string;
  text?: string;
}

export function scoreDoc(query: string, title: string, text: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return 0;
  }
  const titleText = title.toLowerCase();
  const body = text.toLowerCase();
  let score = 0;
  if (titleText.includes(needle)) {
    score += 10;
  }
  if (body.includes(needle)) {
    score += 2;
  }
  for (const word of needle.split(/\s+/).filter(Boolean)) {
    if (titleText.includes(word)) {
      score += 3;
    }
    if (body.includes(word)) {
      score += 1;
    }
  }
  return score;
}

export function snippetFor(query: string, text: string, width = 180): string {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) {
    return "";
  }
  const needle = query.trim().toLowerCase();
  const index = plain.toLowerCase().indexOf(needle.split(/\s+/)[0] ?? needle);
  if (index < 0) {
    return plain.slice(0, width);
  }
  const start = Math.max(0, index - 40);
  const chunk = plain.slice(start, start + width);
  return `${start > 0 ? "…" : ""}${chunk}${start + width < plain.length ? "…" : ""}`;
}

export function pageLocation(location: string): string {
  return location.split("#")[0] ?? location;
}

export function absoluteUrl(siteUrl: string, location: string): string {
  const base = siteUrl.replace(/\/+$/, "");
  const path = pageLocation(location).replace(/^\/+/, "");
  return path ? `${base}/${path}` : `${base}/`;
}

export function rankSearch(
  docs: SearchDoc[],
  query: string,
  siteUrl: string,
  limit = 10,
): SearchHit[] {
  const grouped = new Map<string, SearchHit>();
  for (const doc of docs) {
    const title = doc.title ?? "";
    const text = doc.text ?? "";
    const location = doc.location ?? "";
    const score = scoreDoc(query, title, text);
    if (score <= 0 || !location) {
      continue;
    }
    const url = absoluteUrl(siteUrl, location);
    const current = grouped.get(url);
    const hit: SearchHit = {
      title: title || url,
      url,
      snippet: snippetFor(query, text),
      score,
    };
    if (!current || hit.score > current.score) {
      grouped.set(url, hit);
    }
  }
  return [...grouped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest as SearchHit);
}

export async function searchIndex(
  indexUrl: string,
  siteUrl: string,
  query: string,
  limit = 10,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchHit[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new BlogError("invalid_query", "query is required");
  }
  const response = await fetchImpl(indexUrl);
  if (!response.ok) {
    throw new BlogError(
      "search_unavailable",
      `Search index returned HTTP ${response.status}`,
      true,
    );
  }
  const payload = (await response.json()) as { docs?: SearchDoc[] };
  return rankSearch(payload.docs ?? [], trimmed, siteUrl, limit);
}

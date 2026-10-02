/**
 * WebMCP v1 for namdinh.xyz — progressive enhancement for browser agents.
 * Prefer document.modelContext (current draft); fall back to navigator.
 * Local: chrome://flags/#enable-webmcp-testing
 * Production: optional Origin-Trial meta/header when a token is available.
 */
(() => {
  const SITE_NAME = "Nam";
  const MAX_SEARCH = 10;
  const MAX_RECENT = 10;
  const SNIPPET_WIDTH = 180;

  /** @type {AbortController | null} */
  let registration = null;
  let registered = false;

  function modelContext() {
    const doc = typeof document !== "undefined" ? document.modelContext : null;
    const nav = typeof navigator !== "undefined" ? navigator.modelContext : null;
    return doc || nav || null;
  }

  function textResult(data) {
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return { content: [{ type: "text", text }] };
  }

  function errorResult(code, message) {
    return textResult({ error: { code, message } });
  }

  function absoluteUrl(pathOrUrl) {
    try {
      return new URL(pathOrUrl, location.origin).href;
    } catch {
      return pathOrUrl;
    }
  }

  function pageLocation(location) {
    return String(location || "").split("#")[0] || "";
  }

  function scoreDoc(query, title, text) {
    const needle = query.trim().toLowerCase();
    if (!needle) return 0;
    const titleText = title.toLowerCase();
    const body = text.toLowerCase();
    let score = 0;
    if (titleText.includes(needle)) score += 10;
    if (body.includes(needle)) score += 2;
    for (const word of needle.split(/\s+/).filter(Boolean)) {
      if (titleText.includes(word)) score += 3;
      if (body.includes(word)) score += 1;
    }
    return score;
  }

  function snippetFor(query, text, width = SNIPPET_WIDTH) {
    const plain = String(text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!plain) return "";
    const needle = query.trim().toLowerCase();
    const first = needle.split(/\s+/)[0] || needle;
    const index = plain.toLowerCase().indexOf(first);
    if (index < 0) return plain.slice(0, width);
    const start = Math.max(0, index - 40);
    const chunk = plain.slice(start, start + width);
    return `${start > 0 ? "…" : ""}${chunk}${start + width < plain.length ? "…" : ""}`;
  }

  let searchIndexPromise = null;

  function loadSearchIndex() {
    if (!searchIndexPromise) {
      searchIndexPromise = fetch(new URL("/search/search_index.json", location.origin))
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Search index HTTP ${response.status}`);
          }
          const payload = await response.json();
          return Array.isArray(payload.docs) ? payload.docs : [];
        })
        .catch((error) => {
          searchIndexPromise = null;
          throw error;
        });
    }
    return searchIndexPromise;
  }

  function rankSearch(docs, query, limit = MAX_SEARCH) {
    const grouped = new Map();
    for (const doc of docs) {
      const title = doc.title || "";
      const text = doc.text || "";
      const location = doc.location || "";
      const score = scoreDoc(query, title, text);
      if (score <= 0 || !location) continue;
      const url = absoluteUrl(pageLocation(location));
      const hit = {
        title: title || url,
        url,
        snippet: snippetFor(query, text),
        score,
      };
      const current = grouped.get(url);
      if (!current || hit.score > current.score) grouped.set(url, hit);
    }
    return [...grouped.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ score, ...rest }) => rest);
  }

  async function searchPosts(query, limit = MAX_SEARCH) {
    const trimmed = String(query || "").trim();
    if (!trimmed) return errorResult("invalid_query", "query is required");
    const docs = await loadSearchIndex();
    const capped = Math.min(Math.max(Number(limit) || MAX_SEARCH, 1), 50);
    return textResult({ query: trimmed, results: rankSearch(docs, trimmed, capped) });
  }

  function metaContent(selector) {
    const el = document.querySelector(selector);
    return el ? (el.getAttribute("content") || "").trim() : "";
  }

  function currentPagePayload() {
    const article =
      document.querySelector("article.md-content__inner") ||
      document.querySelector(".md-content__inner") ||
      document.querySelector("main");
    const heading =
      (article && article.querySelector("h1")) || document.querySelector("h1");
    const title = (heading && heading.textContent.trim()) || document.title || SITE_NAME;
    const description =
      metaContent('meta[name="description"]') ||
      metaContent('meta[property="og:description"]');
    const text = article
      ? article.innerText.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
      : "";
    return {
      title,
      url: location.href,
      path: location.pathname,
      description,
      text,
    };
  }

  function normalizeTarget(target) {
    const raw = String(target || "").trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      if (url.origin !== location.origin) {
        throw new Error("navigate_to only allows same-origin URLs");
      }
      return url.pathname + url.search + url.hash;
    }
    if (raw.startsWith("/")) return raw;
    return null;
  }

  async function resolveSlug(slug) {
    const needle = slug.replace(/^\/+|\/+$/g, "").toLowerCase();
    const docs = await loadSearchIndex();
    const matches = [];
    for (const doc of docs) {
      const loc = pageLocation(doc.location || "");
      if (!loc) continue;
      const path = loc.replace(/^\/+|\/+$/g, "").toLowerCase();
      const last = path.split("/").filter(Boolean).pop() || "";
      if (last === needle || path.endsWith(`/${needle}`) || path.includes(`/${needle}/`)) {
        matches.push({ title: doc.title || loc, path: loc.startsWith("/") ? loc : `/${loc}` });
      }
    }
    const unique = [...new Map(matches.map((m) => [m.path, m])).values()];
    if (unique.length === 1) return unique[0].path;
    if (unique.length === 0) return null;
    // Prefer writing posts over other pages when ambiguous.
    const post = unique.find((m) => m.path.includes("/writing/"));
    return (post || unique[0]).path;
  }

  async function navigateTo(target) {
    let path;
    try {
      path = normalizeTarget(target);
    } catch (error) {
      return errorResult("invalid_target", error.message || String(error));
    }
    if (!path) {
      const slug = String(target || "").trim();
      if (!slug) return errorResult("invalid_target", "target is required");
      path = await resolveSlug(slug);
      if (!path) {
        return errorResult("not_found", `No page found for slug or path: ${slug}`);
      }
    }
    const url = absoluteUrl(path);
    location.assign(url);
    return textResult({ navigated: true, url, path });
  }

  function parseRssItems(xmlText, limit) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) {
      throw new Error("Failed to parse RSS feed");
    }
    const items = [...doc.querySelectorAll("item")].slice(0, limit);
    return items.map((item) => ({
      title: (item.querySelector("title")?.textContent || "").trim(),
      url: (item.querySelector("link")?.textContent || "").trim(),
      date: (item.querySelector("pubDate")?.textContent || "").trim(),
      description: (item.querySelector("description")?.textContent || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, SNIPPET_WIDTH),
    }));
  }

  async function listRecentPosts(limit = MAX_RECENT) {
    const capped = Math.min(Math.max(Number(limit) || MAX_RECENT, 1), 50);
    const response = await fetch(new URL("/feed_rss_created.xml", location.origin));
    if (!response.ok) {
      return errorResult("feed_unavailable", `RSS feed HTTP ${response.status}`);
    }
    const posts = parseRssItems(await response.text(), capped);
    return textResult({ count: posts.length, posts });
  }

  async function registerTools(mc) {
    if (registered) return;
    registered = true;
    if (registration) registration.abort();
    registration = new AbortController();
    const { signal } = registration;
    const readOnly = { readOnlyHint: true };

    const tools = [
      {
        name: "search_posts",
        description:
          "Full-text search over published pages on this blog. Returns title, url, and snippet. Prefer this over scraping the search UI.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query" },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 50,
              description: "Max results (default 10)",
            },
          },
          required: ["query"],
        },
        annotations: readOnly,
        execute: async (input) => {
          try {
            return await searchPosts(input?.query, input?.limit);
          } catch (error) {
            return errorResult("search_unavailable", error.message || String(error));
          }
        },
      },
      {
        name: "get_current_page",
        description:
          "Return the title, URL, description, and main text of the page currently open in this tab.",
        inputSchema: {
          type: "object",
          properties: {},
        },
        annotations: readOnly,
        execute: async () => textResult(currentPagePayload()),
      },
      {
        name: "navigate_to",
        description:
          "Navigate this tab to a blog page. Accepts a same-origin URL, a path starting with /, or a post slug (for example how-this-blog-works).",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              description: "URL, path, or post slug",
            },
          },
          required: ["target"],
        },
        annotations: readOnly,
        execute: async (input) => {
          try {
            return await navigateTo(input?.target);
          } catch (error) {
            return errorResult("navigation_failed", error.message || String(error));
          }
        },
      },
      {
        name: "list_recent_posts",
        description:
          "List the most recently published posts from the site RSS feed (title, url, date, short description).",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "integer",
              minimum: 1,
              maximum: 50,
              description: "Max posts (default 10)",
            },
          },
        },
        annotations: readOnly,
        execute: async (input) => {
          try {
            return await listRecentPosts(input?.limit);
          } catch (error) {
            return errorResult("feed_unavailable", error.message || String(error));
          }
        },
      },
    ];

    for (const tool of tools) {
      try {
        const result = mc.registerTool(tool, { signal });
        if (result && typeof result.then === "function") await result;
      } catch (error) {
        // Duplicate registration or unsupported shape — skip quietly.
        console.debug("[webmcp] registerTool failed", tool.name, error);
      }
    }
  }

  function boot() {
    const mc = modelContext();
    if (!mc || typeof mc.registerTool !== "function") return;
    registerTools(mc).catch((error) => {
      console.debug("[webmcp] registration error", error);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  // Instant navigation keeps this script alive; retry once if WebMCP appears later.
  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(() => {
      if (registered) return;
      boot();
    });
  }
})();

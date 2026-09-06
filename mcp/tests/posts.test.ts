import { describe, expect, it } from "vitest";
import { GitHubClient, idempotencyHash, shortIdempotency } from "../src/github.js";
import { createPost, getPublishedPost, updatePost } from "../src/posts.js";
import { renderPost } from "../src/validate.js";
import type { Principal } from "../src/types.js";

const authorsYaml = `authors:
  nam:
    name: Nam
    description: Author
    url: https://github.com/namndinh
`;

const published = renderPost({
  authors: ["nam"],
  categories: ["Notes"],
  comments: false,
  date: "2026-09-06",
  description: "Live post.",
  draft: false,
  slug: "live-post",
  tags: ["notes"],
  title: "Live post",
  excerpt: "Excerpt",
  body: "Body",
});

const collaborator: Principal = {
  tokenId: "tok_alice",
  principal: "alice",
  scopes: ["posts:create", "posts:update"],
  agentName: "cursor",
};

const owner: Principal = {
  tokenId: "tok_nam",
  principal: "nam",
  scopes: ["posts:create", "posts:update", "posts:publish"],
  agentName: "cursor",
};

function githubFetch() {
  const files = new Map<string, { content: string; sha: string }>([
    ["docs/writing/.authors.yml", { content: authorsYaml, sha: "sha-authors" }],
    ["docs/writing/posts/live-post.md", { content: published, sha: "sha-live" }],
    ["docs/writing/index.md", { content: "# Writing\n\n## Start here\n\n", sha: "sha-index" }],
  ]);
  const pulls: Array<{
    number: number;
    html_url: string;
    title: string;
    body: string;
    labels: string[];
  }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : {};

    if (url.includes("/git/ref/heads/main") && method === "GET") {
      return json({ object: { sha: "main-sha" } });
    }
    if (url.includes("/git/refs") && method === "POST") {
      return json({ ref: body.ref }, 201);
    }
    if (url.includes("/contents/")) {
      const path = decodeURIComponent(url.split("/contents/")[1]?.split("?")[0] ?? "");
      if (method === "GET") {
        const file = files.get(path);
        if (!file) return json({ message: "Not Found" }, 404);
        return json({ content: btoa(file.content), sha: file.sha, encoding: "base64" });
      }
      if (method === "PUT") {
        files.set(path, { content: atob(body.content), sha: `sha-${path}` });
        return json({ content: { sha: `sha-${path}` } });
      }
    }
    if (url.includes("/pulls") && method === "POST" && !/\/pulls\/\d+$/.test(url)) {
      const pull = {
        number: pulls.length + 1,
        html_url: `https://github.com/namndinh/blog/pull/${pulls.length + 1}`,
        title: body.title,
        body: body.body,
        labels: [] as string[],
      };
      pulls.push(pull);
      return json(pull, 201);
    }
    if (/\/pulls\/\d+$/.test(url) && method === "GET") {
      const number = Number(url.split("/").pop());
      const pull = pulls.find((item) => item.number === number);
      return pull ? json(pull) : json({ message: "Not Found" }, 404);
    }
    if (url.includes("/issues/") && url.endsWith("/labels") && method === "POST") {
      const number = Number(url.split("/issues/")[1]?.split("/")[0]);
      const pull = pulls.find((item) => item.number === number);
      if (pull) pull.labels.push(...body.labels);
      return json(body.labels || []);
    }
    if (url.includes("/issues?") && method === "GET") {
      return json(pulls.filter((pull) => pull.labels.includes("mcp")).map((pull) => ({
        number: pull.number,
        pull_request: {},
      })));
    }
    return json({ message: `unhandled ${method} ${url}` }, 500);
  };

  return { client: new GitHubClient("namndinh/blog", "token", "main", fetchImpl), pulls, files };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const draftInput = {
  title: "New note",
  slug: "new-note",
  excerpt: "Lead",
  body: "Body",
  description: "A note",
  authors: ["nam"],
  categories: ["Notes"],
  tags: ["notes"],
};

describe("createPost", () => {
  it("forces draft true and opens a labeled PR", async () => {
    const { client, pulls } = githubFetch();
    const result = await createPost(client, collaborator, {
      ...draftInput,
      link_on_writing_index: true,
    });
    expect(result.reused).toBe(false);
    expect(result.validation).toMatchObject({ draft: true, slug: "new-note" });
    expect(pulls[0]?.body).toContain("agent:alice:cursor");
    expect(pulls[0]?.labels).toEqual(expect.arrayContaining(["mcp", "draft-post"]));
  });

  it("rejects an unknown author", async () => {
    const { client } = githubFetch();
    await expect(
      createPost(client, collaborator, { ...draftInput, authors: ["alice"] }),
    ).rejects.toMatchObject({ code: "unknown_author" });
  });

  it("rejects a slug that already exists", async () => {
    const { client } = githubFetch();
    await expect(
      createPost(client, collaborator, { ...draftInput, slug: "live-post" }),
    ).rejects.toMatchObject({ code: "slug_taken" });
  });

  it("returns the existing PR for a repeated idempotency key", async () => {
    const { client, pulls } = githubFetch();
    const first = await createPost(client, collaborator, {
      ...draftInput,
      slug: "idempotent",
      idempotency_key: "agent_request_123",
    });
    const hash = await idempotencyHash("agent_request_123");
    expect(pulls[0]?.labels).toContain(`idemp-${shortIdempotency(hash)}`);
    const second = await createPost(client, collaborator, {
      ...draftInput,
      slug: "idempotent-again",
      idempotency_key: "agent_request_123",
    });
    expect(second.reused).toBe(true);
    expect(second.pr_url).toBe(first.pr_url);
    expect(pulls).toHaveLength(1);
  });

  it("dry-run does not open a PR", async () => {
    const { client, pulls } = githubFetch();
    const result = await createPost(client, collaborator, { ...draftInput, dry_run: true });
    expect(result.dry_run).toBe(true);
    expect(pulls).toHaveLength(0);
  });
});

describe("updatePost", () => {
  it("blocks collaborators from setting draft false", async () => {
    const { client } = githubFetch();
    await expect(
      updatePost(client, collaborator, { slug: "live-post", draft: false }),
    ).rejects.toMatchObject({ code: "forbidden_publish" });
  });

  it("lets a publish-scoped token keep a published post live", async () => {
    const { client, pulls } = githubFetch();
    const result = await updatePost(client, owner, {
      slug: "live-post",
      draft: false,
      excerpt: "Updated excerpt",
    });
    expect(result.reused).toBe(false);
    expect(pulls).toHaveLength(1);
  });
});

describe("getPublishedPost", () => {
  it("returns markdown for a live post and hides drafts", async () => {
    const { client, files } = githubFetch();
    expect((await getPublishedPost(client, "live-post")).title).toBe("Live post");
    files.set("docs/writing/posts/secret.md", {
      content: published.replace("draft: false", "draft: true").replaceAll("live-post", "secret"),
      sha: "sha-secret",
    });
    await expect(getPublishedPost(client, "secret")).rejects.toMatchObject({ code: "not_found" });
  });
});

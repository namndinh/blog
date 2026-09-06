import { agentIdentity } from "./auth.js";
import { BlogError } from "./errors.js";
import type { Principal } from "./types.js";

export interface GitHubFile {
  path: string;
  content: string;
  sha: string;
}

export interface PullRequest {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
}

export class GitHubClient {
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly repo: string,
    private readonly token: string | undefined,
    private readonly defaultBranch: string,
    fetchImpl: typeof fetch = fetch,
  ) {
    // Workers `fetch` throws Illegal invocation if called as a method.
    this.fetchImpl = (input, init) => fetchImpl(input, init);
  }

  private headers(extra?: HeadersInit): Headers {
    const headers = new Headers(extra);
    headers.set("Accept", "application/vnd.github+json");
    headers.set("User-Agent", "nam-blog-mcp");
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    if (this.token) {
      headers.set("Authorization", `Bearer ${this.token}`);
    }
    return headers;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`https://api.github.com${path}`, {
      ...init,
      headers: this.headers(init.headers),
    });
    if (response.status === 404) {
      throw new BlogError("not_found", `GitHub path not found: ${path}`);
    }
    if (response.status === 403 || response.status === 429) {
      const retryAfter = Number(response.headers.get("Retry-After") || "30");
      throw new BlogError(
        "github_rate_limited",
        "GitHub API rate limit or abuse detection",
        true,
        Number.isFinite(retryAfter) ? retryAfter : 30,
      );
    }
    if (!response.ok) {
      const body = await response.text();
      throw new BlogError(
        "github_error",
        `GitHub API ${response.status}: ${body.slice(0, 400)}`,
        response.status >= 500,
      );
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  async getFile(path: string, ref?: string): Promise<GitHubFile> {
    if (!this.token) {
      return this.getPublicFile(path, ref);
    }
    const branch = ref ?? this.defaultBranch;
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const data = await this.request<{
      content?: string;
      sha: string;
    }>(`/repos/${this.repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`);
    if (!data.content) {
      throw new BlogError("not_found", `${path} has no content`);
    }
    return {
      path,
      sha: data.sha,
      content: decodeBase64(data.content),
    };
  }

  private async getPublicFile(path: string, ref?: string): Promise<GitHubFile> {
    const branch = ref ?? this.defaultBranch;
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const url = `https://raw.githubusercontent.com/${this.repo}/${encodeURIComponent(branch)}/${encoded}`;
    const response = await this.fetchImpl(url, {
      headers: { "User-Agent": "nam-blog-mcp" },
    });
    if (response.status === 404) {
      throw new BlogError("not_found", `GitHub path not found: ${path}`);
    }
    if (!response.ok) {
      throw new BlogError(
        "github_error",
        `GitHub raw ${response.status} for ${path}`,
        response.status >= 500,
      );
    }
    return {
      path,
      sha: "",
      content: await response.text(),
    };
  }

  async fileExists(path: string, ref?: string): Promise<boolean> {
    try {
      await this.getFile(path, ref);
      return true;
    } catch (error) {
      if (error instanceof BlogError && error.code === "not_found") {
        return false;
      }
      throw error;
    }
  }

  async getDefaultSha(): Promise<string> {
    this.requireWriteToken();
    const data = await this.request<{ object: { sha: string } }>(
      `/repos/${this.repo}/git/ref/heads/${this.defaultBranch}`,
    );
    return data.object.sha;
  }

  async createBranch(name: string, sha: string): Promise<void> {
    this.requireWriteToken();
    await this.request(`/repos/${this.repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${name}`, sha }),
    });
  }

  async putFile(
    path: string,
    content: string,
    branch: string,
    message: string,
    sha?: string,
  ): Promise<void> {
    this.requireWriteToken();
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    await this.request(`/repos/${this.repo}/contents/${encoded}`, {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: encodeBase64(content),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }

  private requireWriteToken(): void {
    if (!this.token) {
      throw new BlogError(
        "github_not_configured",
        "GITHUB_TOKEN is not set on the Worker. Writes cannot open pull requests.",
      );
    }
  }

  async createPullRequest(title: string, head: string, body: string): Promise<PullRequest> {
    this.requireWriteToken();
    return this.request<PullRequest>(`/repos/${this.repo}/pulls`, {
      method: "POST",
      body: JSON.stringify({
        title,
        head,
        base: this.defaultBranch,
        body,
      }),
    });
  }

  async addLabels(issue: number, labels: string[]): Promise<void> {
    this.requireWriteToken();
    await this.request(`/repos/${this.repo}/issues/${issue}/labels`, {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
  }

  async findIdempotentPull(fullHash: string): Promise<PullRequest | null> {
    this.requireWriteToken();
    const short = shortIdempotency(fullHash);
    const issues = await this.request<Array<{ number: number; pull_request?: unknown }>>(
      `/repos/${this.repo}/issues?state=open&labels=${encodeURIComponent(`mcp,idemp-${short}`)}&per_page=20`,
    );
    for (const issue of issues) {
      if (!issue.pull_request) {
        continue;
      }
      const pull = await this.request<PullRequest>(`/repos/${this.repo}/pulls/${issue.number}`);
      if (pull.body?.includes(`<!-- idempotency: ${fullHash} -->`)) {
        return pull;
      }
    }
    return null;
  }
}

export async function idempotencyHash(key: string): Promise<string> {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function shortIdempotency(fullHash: string): string {
  return fullHash.slice(0, 12);
}

export function postPath(slug: string): string {
  return `docs/writing/posts/${slug}.md`;
}

export function uniqueBranch(principal: string, slug: string): string {
  const suffix = crypto.randomUUID().slice(0, 8);
  return `mcp/${principal}/${slug}-${suffix}`;
}

export function pullRequestBody(options: {
  principal: Principal;
  slug: string;
  draft: boolean;
  action: "create" | "update";
  idempotencyHash?: string;
}): string {
  const identity = agentIdentity(options.principal);
  const lines = [
    `Opened by MCP agent \`${identity}\`.`,
    "",
    "## Summary",
    "",
    `- file: \`${postPath(options.slug)}\``,
    `- action: ${options.action}`,
    `- draft: ${options.draft}`,
    "",
    "Collaborators cannot publish. To go live, set `draft: false` (requires `posts:publish` or a human edit) and merge.",
  ];
  if (options.idempotencyHash) {
    lines.push("", `<!-- idempotency: ${options.idempotencyHash} -->`);
  }
  return lines.join("\n");
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

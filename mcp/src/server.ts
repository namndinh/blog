import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { requireScope, WRITE_TOOLS } from "./auth.js";
import { asErrorBody, BlogError } from "./errors.js";
import { GitHubClient } from "./github.js";
import {
  createPost,
  getPublishedPost,
  listAuthors,
  updatePost,
  validateCreate,
  validateUpdate,
} from "./posts.js";
import { checkRateLimit } from "./rate-limit.js";
import { searchIndex } from "./search.js";
import { validationReport } from "./validate.js";
import type { Env, Principal } from "./types.js";

export interface ServerContext {
  env: Env;
  principal: Principal | null;
  ip: string;
  fetchImpl?: typeof fetch;
}

const createSchema = {
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  body: z.string(),
  description: z.string(),
  authors: z.array(z.string()),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  comments: z.boolean().optional(),
  date: z.string().optional(),
  link_on_writing_index: z.boolean().optional(),
  idempotency_key: z.string().optional(),
  dry_run: z.boolean().optional(),
};

const updateSchema = {
  slug: z.string(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
  body: z.string().optional(),
  description: z.string().optional(),
  authors: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  comments: z.boolean().optional(),
  date: z.string().optional(),
  draft: z.boolean().optional(),
  link_on_writing_index: z.boolean().optional(),
  idempotency_key: z.string().optional(),
  dry_run: z.boolean().optional(),
};

export function createServer(ctx: ServerContext): McpServer {
  const server = new McpServer({
    name: "nam-blog",
    version: "1.0.0",
  });
  const github = new GitHubClient(
    ctx.env.BLOG_REPO,
    ctx.env.GITHUB_TOKEN,
    ctx.env.BLOG_DEFAULT_BRANCH,
    ctx.fetchImpl ?? fetch,
  );

  const run = async (tool: string, fn: () => Promise<unknown>) => {
    try {
      const isWrite = WRITE_TOOLS.includes(tool);
      if (isWrite) {
        checkRateLimit(`write:${ctx.principal?.tokenId ?? ctx.ip}`, 10);
      } else {
        checkRateLimit(`public:${ctx.ip}`, 60);
      }
      return jsonResult(await fn());
    } catch (error) {
      return jsonResult(asErrorBody(error), true);
    }
  };

  server.tool(
    "search",
    "Full-text search over published pages. Public. Returns title, url, and snippet.",
    {
      query: z.string(),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async ({ query, limit }) =>
      run("search", () =>
        searchIndex(
          ctx.env.BLOG_SEARCH_INDEX_URL,
          ctx.env.BLOG_SITE_URL,
          query,
          limit ?? 10,
          ctx.fetchImpl ?? fetch,
        ),
      ),
  );

  server.tool(
    "get_details",
    "Fetch published Markdown source by slug, repo path, or site URL. Public. Drafts return not_found.",
    { id: z.string() },
    async ({ id }) => run("get_details", () => getPublishedPost(github, id)),
  );

  server.tool(
    "list_authors",
    "List author ids from docs/writing/.authors.yml. Public. Use these ids in create_post authors.",
    {},
    async () => run("list_authors", () => listAuthors(github)),
  );

  if (!ctx.principal) {
    return server;
  }

  server.tool(
    "validate_post",
    "Dry-run validation for create or update. Requires a bearer token. Does not open a pull request.",
    {
      mode: z.enum(["create", "update"]).optional(),
      ...createSchema,
      draft: z.boolean().optional(),
    },
    async (input) =>
      run("validate_post", async () => {
        const principal = requireScope(ctx.principal, "posts:create");
        const allowPublish = principal.scopes.includes("posts:publish");
        if ((input.mode ?? "create") === "update") {
          const { fields } = await validateUpdate(github, input, allowPublish);
          return { dry_run: true, validation: validationReport(fields) };
        }
        const fields = await validateCreate(github, input, allowPublish);
        return { dry_run: true, validation: validationReport(fields) };
      }),
  );

  server.tool(
    "create_post",
    "Create a draft blog post and open a GitHub pull request. Forces draft: true. Requires posts:create.",
    createSchema,
    async (input) =>
      run("create_post", () => {
        const principal = requireScope(ctx.principal, "posts:create");
        return createPost(github, principal, input);
      }),
  );

  server.tool(
    "update_post",
    "Update an existing post on a branch and open a pull request. Setting draft: false requires posts:publish.",
    updateSchema,
    async (input) =>
      run("update_post", () => {
        const principal = requireScope(ctx.principal, "posts:update");
        return updatePost(github, principal, input);
      }),
  );

  return server;
}

export function jsonResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

export function unauthorizedWriteResult() {
  return jsonResult(
    new BlogError("unauthorized", "Write tools require a Bearer token").toJSON(),
    true,
  );
}

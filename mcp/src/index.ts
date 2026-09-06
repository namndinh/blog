import { createMcpHandler } from "agents/mcp";
import { authenticate, parseTokenStore, sanitizeAgentName, WRITE_TOOLS } from "./auth.js";
import { asErrorBody, BlogError } from "./errors.js";
import { clientIp } from "./rate-limit.js";
import { createServer, unauthorizedWriteResult } from "./server.js";
import type { Env, Principal } from "./types.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return Response.json({
        name: "nam-blog",
        mcp: "/mcp",
        health: "/health",
        docs: `${env.BLOG_SITE_URL.replace(/\/+$/, "")}/llms.txt`,
      });
    }

    const payload = await peekJson(request);
    let principal: Principal | null = null;
    try {
      principal = await resolvePrincipal(request, env);
    } catch (error) {
      if (isMcpWriteCall(request, payload) || isToolsListOrCall(payload)) {
        return mcpToolError(payload, error);
      }
      return Response.json(asErrorBody(error), { status: 401 });
    }

    if (!principal && isMcpWriteCall(request, payload)) {
      return mcpToolResult(payload, unauthorizedWriteResult());
    }

    const server = createServer({
      env,
      principal,
      ip: clientIp(request),
    });
    return createMcpHandler(server)(request, env, ctx);
  },
};

async function resolvePrincipal(request: Request, env: Env): Promise<Principal | null> {
  const tokens = parseTokenStore(env.MCP_TOKENS);
  const agentName = sanitizeAgentName(request.headers.get("X-Agent-Name") || "cursor");
  return authenticate(request.headers.get("Authorization"), tokens, agentName);
}

const peekCache = new WeakMap<Request, unknown>();

async function peekJson(request: Request): Promise<unknown> {
  if (peekCache.has(request)) {
    return peekCache.get(request);
  }
  if (request.method === "GET" || request.method === "HEAD") {
    peekCache.set(request, null);
    return null;
  }
  try {
    const body = await request.clone().json();
    peekCache.set(request, body);
    return body;
  } catch {
    peekCache.set(request, null);
    return null;
  }
}

function isToolsListOrCall(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || !("method" in payload)) {
    return false;
  }
  return (
    (payload as { method?: string }).method === "tools/list" ||
    (payload as { method?: string }).method === "tools/call"
  );
}

function isMcpWriteCall(request: Request, payload: unknown): boolean {
  if (request.method !== "POST" || !payload || typeof payload !== "object") {
    return false;
  }
  const body = payload as { method?: string; params?: { name?: string } };
  return body.method === "tools/call" && WRITE_TOOLS.includes(body.params?.name ?? "");
}

function mcpToolError(payload: unknown, error: unknown): Response {
  const id = payload && typeof payload === "object" && "id" in payload ? payload.id : null;
  return Response.json({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(asErrorBody(error), null, 2) }],
      isError: true,
    },
  });
}

function mcpToolResult(
  payload: unknown,
  result: { content: { type: "text"; text: string }[]; isError: boolean },
): Response {
  const id = payload && typeof payload === "object" && "id" in payload ? payload.id : null;
  return Response.json({ jsonrpc: "2.0", id, result });
}

export { BlogError };

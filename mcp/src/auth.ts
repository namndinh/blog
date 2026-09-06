import { BlogError } from "./errors.js";
import type { Principal, Scope, TokenRecord } from "./types.js";

export const WRITE_SCOPES: Scope[] = [
  "posts:create",
  "posts:update",
  "posts:publish",
];

export const WRITE_TOOLS = ["validate_post", "create_post", "update_post"];

export async function hashToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function parseTokenStore(raw: string | undefined): TokenRecord[] {
  if (!raw?.trim()) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new BlogError("invalid_token_store", "MCP_TOKENS must be a JSON array");
  }
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new BlogError("invalid_token_store", `Token ${index} is not an object`);
    }
    const record = entry as Partial<TokenRecord>;
    if (!record.id || !record.hash || !record.principal || !Array.isArray(record.scopes)) {
      throw new BlogError(
        "invalid_token_store",
        `Token ${index} needs id, hash, principal, and scopes`,
      );
    }
    return {
      id: record.id,
      hash: record.hash.toLowerCase(),
      principal: record.principal,
      scopes: record.scopes,
      expires_at: record.expires_at ?? null,
    };
  });
}

export function bearerToken(authorization: string | null | undefined): string | null {
  if (!authorization) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export async function authenticate(
  authorization: string | null | undefined,
  tokens: TokenRecord[],
  agentName = "cursor",
  now = new Date(),
): Promise<Principal | null> {
  const token = bearerToken(authorization);
  if (!token) {
    return null;
  }
  const digest = await hashToken(token);
  const record = tokens.find((item) => item.hash === digest);
  if (!record) {
    throw new BlogError("invalid_token", "Bearer token is not recognized");
  }
  if (record.expires_at && new Date(record.expires_at) <= now) {
    throw new BlogError("token_expired", "Bearer token has expired");
  }
  return {
    tokenId: record.id,
    principal: record.principal,
    scopes: record.scopes,
    agentName: sanitizeAgentName(agentName),
  };
}

export function requirePrincipal(principal: Principal | null): Principal {
  if (!principal) {
    throw new BlogError("unauthorized", "Write tools require a Bearer token");
  }
  return principal;
}

export function requireScope(principal: Principal | null, scope: Scope): Principal {
  const actor = requirePrincipal(principal);
  if (!actor.scopes.includes(scope)) {
    throw new BlogError("forbidden", `Token is missing the ${scope} scope`);
  }
  return actor;
}

export function agentIdentity(principal: Principal): string {
  return `agent:${principal.principal}:${principal.agentName}`;
}

export function sanitizeAgentName(name: string): string {
  const cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "cursor";
}

export function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `blog_${encoded}`;
}

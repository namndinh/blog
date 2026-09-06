#!/usr/bin/env node
import { randomBytes, createHash } from "node:crypto";

const args = process.argv.slice(2);
const principal = flag("principal") || "nam";
const scopes = (flag("scopes") || "posts:create,posts:update")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const expiresAt = flag("expires-at") || null;

const raw = `blog_${randomBytes(24).toString("base64url")}`;
const hash = createHash("sha256").update(raw).digest("hex");
const record = {
  id: `tok_${principal}_${hash.slice(0, 8)}`,
  hash,
  principal,
  scopes,
  expires_at: expiresAt,
};

console.log("Token (store this; it is shown once):\n");
console.log(raw);
console.log("\nAdd this object to the MCP_TOKENS JSON array secret:\n");
console.log(JSON.stringify(record, null, 2));

function flag(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

import { describe, expect, it } from "vitest";
import { authenticate, hashToken, parseTokenStore, requireScope } from "../src/auth.js";
import { BlogError } from "../src/errors.js";
import type { Scope } from "../src/types.js";

describe("auth", () => {
  it("authenticates a hashed bearer token", async () => {
    const token = "blog_secret";
    const principal = await authenticate(
      `Bearer ${token}`,
      [
        {
          id: "tok_nam",
          hash: await hashToken(token),
          principal: "nam",
          scopes: ["posts:create", "posts:update"] as Scope[],
        },
      ],
      "Cursor App",
    );
    expect(principal?.principal).toBe("nam");
    expect(principal?.agentName).toBe("cursor-app");
  });

  it("returns null without a header", async () => {
    expect(await authenticate(null, [])).toBeNull();
  });

  it("rejects an unknown token", async () => {
    await expect(authenticate("Bearer nope", [])).rejects.toMatchObject({
      code: "invalid_token",
    });
  });

  it("rejects an expired token", async () => {
    const token = "blog_old";
    await expect(
      authenticate(`Bearer ${token}`, [
        {
          id: "tok_old",
          hash: await hashToken(token),
          principal: "nam",
          scopes: ["posts:create"] as Scope[],
          expires_at: "2020-01-01T00:00:00Z",
        },
      ]),
    ).rejects.toMatchObject({ code: "token_expired" });
  });

  it("enforces scopes", () => {
    expect(() =>
      requireScope(
        {
          tokenId: "tok_nam",
          principal: "nam",
          scopes: ["posts:create"] as Scope[],
          agentName: "cursor",
        },
        "posts:publish",
      ),
    ).toThrow(BlogError);
  });

  it("parses a token store", () => {
    expect(
      parseTokenStore(
        JSON.stringify([
          { id: "tok_nam", hash: "abc", principal: "nam", scopes: ["posts:create"] },
        ]),
      )[0]?.hash,
    ).toBe("abc");
  });
});

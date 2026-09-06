import { describe, expect, it } from "vitest";
import { GitHubClient } from "../src/github.js";

describe("GitHubClient public reads", () => {
  it("loads files from raw.githubusercontent.com when no token is set", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      expect(String(input)).toBe(
        "https://raw.githubusercontent.com/namndinh/blog/main/docs/writing/.authors.yml",
      );
      return new Response("authors:\n  nam:\n    name: Nam\n", { status: 200 });
    };
    const client = new GitHubClient("namndinh/blog", undefined, "main", fetchImpl);
    const file = await client.getFile("docs/writing/.authors.yml");
    expect(file.content).toContain("nam:");
    expect(file.sha).toBe("");
  });

  it("blocks writes without a GitHub token", async () => {
    const client = new GitHubClient("namndinh/blog", undefined, "main", fetch);
    await expect(client.getDefaultSha()).rejects.toMatchObject({
      code: "github_not_configured",
    });
  });
});

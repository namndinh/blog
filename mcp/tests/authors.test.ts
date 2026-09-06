import { describe, expect, it } from "vitest";
import {
  appendWritingIndexLink,
  findAuthor,
  githubLoginFromUrl,
  knownAuthorIds,
  parseAuthorsYaml,
  profileToAuthor,
  renderAuthorsYaml,
  resolveAuthorIds,
} from "../src/authors.js";
import { BlogError } from "../src/errors.js";

const source = `authors:
  nam:
    name: Nam
    description: Author
    avatar: https://avatars.githubusercontent.com/u/43260973?v=4
    url: https://github.com/namndinh
`;

const aliceProfile = {
  login: "Alice",
  name: "Alice Example",
  avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
  html_url: "https://github.com/Alice",
  bio: "Writes notes.\nAlso bikes.",
};

describe("authors", () => {
  it("parses .authors.yml including avatar", () => {
    const authors = parseAuthorsYaml(source);
    expect(authors[0]).toMatchObject({
      id: "nam",
      name: "Nam",
      avatar: "https://avatars.githubusercontent.com/u/43260973?v=4",
      url: "https://github.com/namndinh",
    });
    expect(knownAuthorIds(authors).has("nam")).toBe(true);
  });

  it("round-trips authors yaml", () => {
    expect(renderAuthorsYaml(parseAuthorsYaml(source))).toBe(source);
  });

  it("maps a GitHub profile URL back to the existing author id", () => {
    const authors = parseAuthorsYaml(source);
    expect(githubLoginFromUrl(authors[0]?.url)).toBe("namndinh");
    expect(findAuthor(authors, "namndinh")?.id).toBe("nam");
  });

  it("builds an author record from a GitHub profile", () => {
    expect(profileToAuthor(aliceProfile)).toEqual({
      id: "alice",
      name: "Alice Example",
      description: "Writes notes. Also bikes.",
      avatar: "https://avatars.githubusercontent.com/u/1?v=4",
      url: "https://github.com/Alice",
    });
  });

  it("resolves a new GitHub username and reuses a profile URL match", async () => {
    const existing = parseAuthorsYaml(source);
    const fetched: string[] = [];
    const resolved = await resolveAuthorIds(
      ["namndinh", "alice"],
      existing,
      async (login) => {
        fetched.push(login);
        if (login.toLowerCase() === "alice") return aliceProfile;
        throw new BlogError("not_found", login);
      },
    );
    expect(fetched).toEqual(["alice"]);
    expect(resolved.ids).toEqual(["nam", "alice"]);
    expect(resolved.added).toHaveLength(1);
    expect(resolved.added[0]?.avatar).toContain("avatars.githubusercontent.com");
  });

  it("rejects a login that is not a GitHub user", async () => {
    await expect(
      resolveAuthorIds(["not-a-user"], [], async () => {
        throw new BlogError("not_found", "missing");
      }),
    ).rejects.toMatchObject({ code: "unknown_author" });
  });

  it("appends a writing index link once", () => {
    const once = appendWritingIndexLink("# Writing\n\n", "Hello", "hello", "A post");
    expect(once).toContain("- [Hello](./posts/hello.md) — A post");
    expect(appendWritingIndexLink(once, "Hello", "hello", "A post")).toBe(once);
  });
});

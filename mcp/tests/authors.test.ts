import { describe, expect, it } from "vitest";
import { appendWritingIndexLink, knownAuthorIds, parseAuthorsYaml } from "../src/authors.js";

const source = `authors:
  nam:
    name: Nam
    description: Author
    avatar: https://avatars.githubusercontent.com/u/43260973?v=4
    url: https://github.com/namndinh
`;

describe("authors", () => {
  it("parses .authors.yml", () => {
    const authors = parseAuthorsYaml(source);
    expect(authors[0]).toMatchObject({ id: "nam", name: "Nam" });
    expect(knownAuthorIds(authors).has("nam")).toBe(true);
  });

  it("appends a writing index link once", () => {
    const once = appendWritingIndexLink("# Writing\n\n", "Hello", "hello", "A post");
    expect(once).toContain("- [Hello](./posts/hello.md) — A post");
    expect(appendWritingIndexLink(once, "Hello", "hello", "A post")).toBe(once);
  });
});

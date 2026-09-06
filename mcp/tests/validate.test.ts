import { describe, expect, it } from "vitest";
import { BlogError } from "../src/errors.js";
import { parseFrontmatter, parsePostId, renderPost, validatePostFields } from "../src/validate.js";

const authors = new Set(["nam"]);
const base = {
  title: "Hello",
  slug: "hello-world",
  excerpt: "A short lead.",
  body: "The rest of the post.",
  description: "One sentence.",
  authors: ["nam"],
  categories: ["Notes"],
  tags: ["notes"],
  comments: false,
  date: "2026-09-06",
  draft: false,
};

describe("validatePostFields", () => {
  it("forces draft true on create", () => {
    expect(
      validatePostFields(base, authors, { forceDraft: true, allowPublish: false }).draft,
    ).toBe(true);
  });

  it("rejects draft false without publish scope", () => {
    try {
      validatePostFields(base, authors, { forceDraft: false, allowPublish: false });
    } catch (error) {
      expect((error as BlogError).code).toBe("forbidden_publish");
    }
  });

  it("allows draft false with publish scope", () => {
    expect(
      validatePostFields(base, authors, { forceDraft: false, allowPublish: true }).draft,
    ).toBe(false);
  });

  it("rejects unknown authors", () => {
    try {
      validatePostFields({ ...base, authors: ["alice"] }, authors, {
        forceDraft: true,
        allowPublish: false,
      });
    } catch (error) {
      expect((error as BlogError).code).toBe("unknown_author");
    }
  });

  it("rejects a bad slug", () => {
    try {
      validatePostFields({ ...base, slug: "Hello World" }, authors, {
        forceDraft: true,
        allowPublish: false,
      });
    } catch (error) {
      expect((error as BlogError).code).toBe("invalid_slug");
    }
  });
});

describe("render and parse", () => {
  it("round-trips a valid post", () => {
    const fields = validatePostFields(base, authors, {
      forceDraft: true,
      allowPublish: false,
    });
    const parsed = parseFrontmatter(renderPost(fields));
    expect(parsed.title).toBe("Hello");
    expect(parsed.frontmatter.slug).toBe("hello-world");
  });
});

describe("parsePostId", () => {
  it("accepts slug, path, and published URL", () => {
    expect(parsePostId("how-this-blog-works")).toBe("how-this-blog-works");
    expect(parsePostId("docs/writing/posts/how-this-blog-works.md")).toBe("how-this-blog-works");
    expect(
      parsePostId("https://namndinh.github.io/blog/writing/2026/09/06/how-this-blog-works/"),
    ).toBe("how-this-blog-works");
  });
});

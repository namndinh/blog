import { describe, expect, it } from "vitest";
import { absoluteUrl, rankSearch, scoreDoc } from "../src/search.js";

describe("search", () => {
  it("ranks title matches above body matches", () => {
    const hits = rankSearch(
      [
        { location: "writing/body/", title: "Other", text: "Mentions checklist in the body" },
        { location: "writing/title/", title: "The checklist", text: "Unrelated" },
        { location: "writing/title/#section", title: "The checklist", text: "More checklist detail" },
      ],
      "checklist",
      "https://namndinh.github.io/blog",
      10,
    );
    expect(hits[0]?.url).toBe("https://namndinh.github.io/blog/writing/title/");
    expect(hits).toHaveLength(2);
  });

  it("scores an empty query as zero", () => {
    expect(scoreDoc("   ", "Title", "Text")).toBe(0);
  });

  it("builds site URLs", () => {
    expect(absoluteUrl("https://namndinh.github.io/blog/", "writing/foo/#bar")).toBe(
      "https://namndinh.github.io/blog/writing/foo/",
    );
  });
});

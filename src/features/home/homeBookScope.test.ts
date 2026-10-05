import { describe, expect, it } from "vitest";

import type { FeedItem } from "@/services/contracts";
import {
  homeOriginalBookFormat,
  isHomeOriginalBook,
} from "./homeBookScope";

function book(
  kind: NonNullable<FeedItem["book"]>["kind"],
  pdfUrl?: string,
): Pick<FeedItem, "type" | "book"> {
  return {
    type: "book",
    book: {
      kind,
      bookTitle: "测试书籍",
      authors: [],
      pdfUrl,
    },
  };
}

describe("home original book scope", () => {
  it("includes original PDF, LaTeX, Markdown and Typst books", () => {
    expect(homeOriginalBookFormat(book("original", "/book.pdf"))).toBe(
      "pdf",
    );
    expect(homeOriginalBookFormat(book("original"))).toBe("latex");
    expect(homeOriginalBookFormat(book("markdown"))).toBe("markdown");
    expect(homeOriginalBookFormat(book("typst"))).toBe("typst");
    expect(isHomeOriginalBook(book("typst"))).toBe(true);
  });

  it("excludes published books even when they have a PDF", () => {
    const published = book("copyrighted", "/published.pdf");
    expect(homeOriginalBookFormat(published)).toBeNull();
    expect(isHomeOriginalBook(published)).toBe(false);
  });
});

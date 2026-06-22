import { describe, it, expect, vi, beforeEach } from "vitest";
import { Buffer } from "buffer";
import { extractPptxText } from "./pptx-extractor";
import { RawDocument } from "./types";

// Mock pptx-parse module
vi.mock("pptx-parse", () => ({
  default: {
    toJson: vi.fn(),
  },
}));

describe("extractPptxText", () => {
  let mockRawDocument: RawDocument;

  beforeEach(() => {
    mockRawDocument = {
      fileType: "pptx",
      fileName: "test.pptx",
      buffer: Buffer.from("mock pptx content"),
      textDensity: 0.12,
      parsingMethod: "pdfmupdf",
    };
  });

  it("should extract text from all slides in a PPTX", async () => {
    const pptxParser = await import("pptx-parse");

    (pptxParser.default.toJson as any).mockResolvedValue({
      slides: [
        {
          shapes: [
            { text: "Slide 1 Title" },
            { text: "Introduction to the topic" },
          ],
        },
        {
          shapes: [
            { text: "Slide 2 Title" },
            { text: "Key points and details" },
          ],
        },
      ],
    });

    const result = await extractPptxText(mockRawDocument);

    expect(result.fullText).toContain("Slide 1 Title");
    expect(result.fullText).toContain("Introduction to the topic");
    expect(result.fullText).toContain("Slide 2 Title");
    expect(result.fullText).toContain("Key points and details");
    expect(result.pageCount).toBe(2);
    expect(result.textDensity).toBe(0.12);
    expect(result.parsingMethod).toBe("pdfmupdf");
  });

  it("should throw error for non-PPTX file type", async () => {
    mockRawDocument.fileType = "pdf";

    await expect(extractPptxText(mockRawDocument)).rejects.toThrow(
      "extractPptxText expects fileType='pptx'"
    );
  });

  it("should throw error for sparse text extraction", async () => {
    const pptxParser = await import("pptx-parse");

    (pptxParser.default.toJson as any).mockResolvedValue({
      slides: [
        {
          shapes: [{ text: "Hi" }], // Too short
        },
      ],
    });

    await expect(extractPptxText(mockRawDocument)).rejects.toThrow(
      "PPTX extraction resulted in less than 100 characters of text"
    );
  });

  it("should handle slides with no shapes", async () => {
    const pptxParser = await import("pptx-parse");

    (pptxParser.default.toJson as any).mockResolvedValue({
      slides: [
        {
          shapes: [],
        },
        {
          shapes: [
            {
              text: "This is content from a slide with many words to exceed the hundred character minimum threshold for extraction validation.",
            },
          ],
        },
      ],
    });

    const result = await extractPptxText(mockRawDocument);

    expect(result.pageCount).toBe(2);
    expect(result.fullText).toContain("Slide 1");
    expect(result.fullText).toContain("Slide 2");
  });

  it("should handle extraction errors gracefully", async () => {
    const pptxParser = await import("pptx-parse");

    (pptxParser.default.toJson as any).mockRejectedValue(
      new Error("Invalid PPTX archive")
    );

    await expect(extractPptxText(mockRawDocument)).rejects.toThrow(
      "PPTX extraction failed"
    );
  });
});

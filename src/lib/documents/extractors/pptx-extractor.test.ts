import { describe, it, expect, vi, beforeEach } from "vitest";
import { Buffer } from "buffer";
import { extractPptxText } from "./pptx-extractor";
import { RawDocument } from "./types";

// Mock pptx-text-parser — default export takes filepath, returns string
vi.mock("pptx-text-parser", () => ({
  default: vi.fn(),
}));

// Mock fs so we don't write real temp files in tests
vi.mock("fs", () => ({
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("os", () => ({
  tmpdir: () => "/tmp",
}));

vi.mock("path", () => ({
  join: (...parts: string[]) => parts.join("/"),
}));

describe("extractPptxText", () => {
  let mockRawDocument: RawDocument;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRawDocument = {
      fileType: "pptx",
      fileName: "test.pptx",
      buffer: Buffer.from("mock pptx content"),
      textDensity: 0.12,
      parsingMethod: "pdfmupdf",
    };
  });

  it("should extract text from PPTX via pptx-text-parser", async () => {
    const { default: extractPptxFile } = await import("pptx-text-parser");
    (extractPptxFile as any).mockResolvedValue(
      "Slide 1 Title\nIntroduction to the topic\nSlide 2 Title\nKey points and details\nMore content here for length padding."
    );

    const result = await extractPptxText(mockRawDocument);

    expect(result.fullText).toContain("Slide 1 Title");
    expect(result.fullText).toContain("Introduction to the topic");
    expect(result.textDensity).toBe(0.12);
    expect(result.parsingMethod).toBe("pdfmupdf");
  });

  it("should throw error for non-PPTX file type", async () => {
    mockRawDocument.fileType = "pdf";

    await expect(extractPptxText(mockRawDocument)).rejects.toThrow(
      "extractPptxText expects fileType='pptx'"
    );
  });

  it("should throw error for sparse text extraction (< 100 chars)", async () => {
    const { default: extractPptxFile } = await import("pptx-text-parser");
    (extractPptxFile as any).mockResolvedValue("Hi");

    await expect(extractPptxText(mockRawDocument)).rejects.toThrow(
      "PPTX extraction resulted in less than 100 characters of text"
    );
  });

  it("should handle extraction errors gracefully", async () => {
    const { default: extractPptxFile } = await import("pptx-text-parser");
    (extractPptxFile as any).mockRejectedValue(new Error("Invalid PPTX archive"));

    await expect(extractPptxText(mockRawDocument)).rejects.toThrow(
      "PPTX extraction failed"
    );
  });

  it("should trim trailing whitespace from extracted text", async () => {
    const { default: extractPptxFile } = await import("pptx-text-parser");
    const paddedText = "  Slide content with padding and plenty of additional words here to comfortably exceed the one hundred character minimum length requirement for extraction.  ";
    // const paddedText = "  Slide content with padding and multiple words for minimum length check.  ";
    (extractPptxFile as any).mockResolvedValue(paddedText);

    const result = await extractPptxText(mockRawDocument);

    expect(result.fullText).not.toMatch(/^\s|\s$/);
  });
});

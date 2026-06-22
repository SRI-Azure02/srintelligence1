import { describe, it, expect, vi, beforeEach } from "vitest";
import { Buffer } from "buffer";
import { extractDocxText } from "./docx-extractor";
import { RawDocument } from "./types";

// Mock mammoth module
vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

describe("extractDocxText", () => {
  let mockRawDocument: RawDocument;

  beforeEach(() => {
    mockRawDocument = {
      fileType: "docx",
      fileName: "test.docx",
      buffer: Buffer.from("mock docx content"),
      textDensity: 0.18,
      parsingMethod: "pdfmupdf",
    };
  });

  it("should extract text from a valid DOCX file", async () => {
    const mammoth = await import("mammoth");

    (mammoth.default.extractRawText as any).mockResolvedValue({
      value: "This is extracted text from a Word document.\n\nMore content here.",
      messages: [],
    });

    const result = await extractDocxText(mockRawDocument);

    expect(result.fullText).toBe(
      "This is extracted text from a Word document.\n\nMore content here."
    );
    expect(result.pageCount).toBeUndefined();
    expect(result.textDensity).toBe(0.18);
    expect(result.parsingMethod).toBe("pdfmupdf");
    expect(result.warnings).toEqual([]);
  });

  it("should throw error for non-DOCX file type", async () => {
    mockRawDocument.fileType = "pdf";

    await expect(extractDocxText(mockRawDocument)).rejects.toThrow(
      "extractDocxText expects fileType='docx'"
    );
  });

  it("should throw error for sparse text extraction", async () => {
    const mammoth = await import("mammoth");

    (mammoth.default.extractRawText as any).mockResolvedValue({
      value: "Short", // Less than 100 characters
      messages: [],
    });

    await expect(extractDocxText(mockRawDocument)).rejects.toThrow(
      "DOCX extraction resulted in less than 100 characters of text"
    );
  });

  it("should capture warnings from extraction", async () => {
    const mammoth = await import("mammoth");

    const warnings = [
      { message: "Unsupported element: customXml" },
      { message: "Picture not extracted" },
    ];

    (mammoth.default.extractRawText as any).mockResolvedValue({
      value: "Text content with some warnings during extraction process here.",
      messages: warnings,
    });

    const result = await extractDocxText(mockRawDocument);

    expect(result.warnings).toHaveLength(2);
    expect(result.warnings).toContain("Unsupported element: customXml");
  });

  it("should handle extraction errors gracefully", async () => {
    const mammoth = await import("mammoth");

    (mammoth.default.extractRawText as any).mockRejectedValue(
      new Error("Invalid DOCX format")
    );

    await expect(extractDocxText(mockRawDocument)).rejects.toThrow(
      "DOCX extraction failed"
    );
  });
});

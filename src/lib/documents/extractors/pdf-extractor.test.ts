import { describe, it, expect, vi, beforeEach } from "vitest";
import { Buffer } from "buffer";
import { extractPdfText } from "./pdf-extractor";
import { RawDocument } from "./types";

// Mock unpdf module
vi.mock("unpdf", () => ({
  getDocumentProxy: vi.fn(),
  extractText: vi.fn(),
}));

describe("extractPdfText", () => {
  let mockRawDocument: RawDocument;

  beforeEach(() => {
    mockRawDocument = {
      fileType: "pdf",
      fileName: "test.pdf",
      buffer: Buffer.from("mock pdf content"),
      textDensity: 0.15,
      parsingMethod: "pdfmupdf",
    };
  });

  it("should extract text from a valid PDF", async () => {
    const { getDocumentProxy, extractText } = await import("unpdf");

    (getDocumentProxy as any).mockResolvedValue({
      numPages: 5,
    });

    (extractText as any).mockResolvedValue(
      "Sample text content from PDF\n\nMore content here."
    );

    const result = await extractPdfText(mockRawDocument);

    expect(result.fullText).toBe("Sample text content from PDF\n\nMore content here.");
    expect(result.pageCount).toBe(5);
    expect(result.textDensity).toBe(0.15);
    expect(result.parsingMethod).toBe("pdfmupdf");
    expect(result.extractedAt).toBeInstanceOf(Date);
  });

  it("should throw error for non-PDF file type", async () => {
    mockRawDocument.fileType = "docx";

    await expect(extractPdfText(mockRawDocument)).rejects.toThrow(
      "extractPdfText expects fileType='pdf'"
    );
  });

  it("should throw error for sparse text extraction", async () => {
    const { getDocumentProxy, extractText } = await import("unpdf");

    (getDocumentProxy as any).mockResolvedValue({ numPages: 1 });
    (extractText as any).mockResolvedValue("Too"); // Less than 100 characters

    await expect(extractPdfText(mockRawDocument)).rejects.toThrow(
      "PDF extraction resulted in less than 100 characters of text"
    );
  });

  it("should handle extraction errors gracefully", async () => {
    const { getDocumentProxy } = await import("unpdf");

    (getDocumentProxy as any).mockRejectedValue(new Error("PDF parsing failed"));

    await expect(extractPdfText(mockRawDocument)).rejects.toThrow(
      "PDF extraction failed"
    );
  });
});

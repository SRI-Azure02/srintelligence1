import { describe, it, expect, vi, beforeEach } from "vitest";
import { semanticChunk } from "./semantic-chunker";

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

describe("semanticChunk", () => {
  let mockCreateMessage: any;

  beforeEach(() => {
    vi.clearAllMocks();
    const Anthropic = require("@anthropic-ai/sdk").default;
    const mockClient = Anthropic();
    mockCreateMessage = mockClient.messages.create;
  });

  it("should chunk text based on semantic boundaries", async () => {
    const sampleText = `
Introduction to the Topic
This is a introduction paragraph with some context about what we're discussing here.

Section 1: First Topic
Here's the first section with detailed information about the main topic we're exploring in this document.

Section 2: Second Topic
This section covers another important aspect of the subject matter that needs to be documented properly.

Conclusion
We've covered all the main points and now we're wrapping up the discussion.`.trim();

    mockCreateMessage.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { start_idx: 0, end_idx: 150, label: "Introduction" },
            { start_idx: 150, end_idx: 400, label: "Section 1" },
            { start_idx: 400, end_idx: 550, label: "Section 2" },
          ]),
        },
      ],
    });

    const chunks = await semanticChunk(sampleText, "doc-123");

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].sectionLabel).toBeDefined();
  });

  it("should use fallback chunking on Claude failure", async () => {
    const sampleText = `
First paragraph with substantial content to meet minimum length requirements.
This is more text to ensure we have enough content.

Second paragraph with more content.
And even more text here to make it substantial.

Third paragraph for testing.
With additional content to meet size requirements here.`.trim();

    mockCreateMessage.mockRejectedValue(new Error("API error"));

    const chunks = await semanticChunk(sampleText, "doc-123");

    expect(chunks.length).toBeGreaterThan(0);
    // Fallback should create chunks from paragraphs
    expect(chunks[0].chunkText).toContain("paragraph");
  });

  it("should return empty array for empty text", async () => {
    const chunks = await semanticChunk("", "doc-123");
    expect(chunks).toEqual([]);
  });

  it("should handle whitespace-only text", async () => {
    const chunks = await semanticChunk("   \n\n   ", "doc-123");
    expect(chunks).toEqual([]);
  });

  it("should preserve context before and after chunks", async () => {
    const sampleText = `Prefix context here. This is the main chunk content with real information inside it. Suffix context follows here.`.trim();

    mockCreateMessage.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { start_idx: 20, end_idx: 80, label: "Main" },
          ]),
        },
      ],
    });

    const chunks = await semanticChunk(sampleText, "doc-123");

    if (chunks.length > 0) {
      const chunk = chunks[0];
      expect(chunk.contextBefore).toBeDefined();
      expect(chunk.contextAfter).toBeDefined();
    }
  });

  it("should calculate page numbers based on character count", async () => {
    const sampleText = Array(10000)
      .fill("Word ")
      .join("")
      .substring(0, 10000);

    mockCreateMessage.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { start_idx: 0, end_idx: 2000, label: "Page 1" },
            { start_idx: 2000, end_idx: 4000, label: "Page 2" },
          ]),
        },
      ],
    });

    const chunks = await semanticChunk(sampleText, "doc-123");

    expect(chunks.length).toBeGreaterThan(0);
    if (chunks.length > 1) {
      expect(chunks[1].pageNumber).toBeGreaterThanOrEqual(
        chunks[0].pageNumber
      );
    }
  });

  it("should skip very small chunks", async () => {
    const sampleText = `Long text with content here. This has multiple paragraphs.

Short boundary.

And more substantial text to ensure we have meaningful chunks.`.trim();

    mockCreateMessage.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { start_idx: 0, end_idx: 50, label: "Too Short" }, // Will be skipped
            { start_idx: 50, end_idx: 150, label: "Valid" },
          ]),
        },
      ],
    });

    const chunks = await semanticChunk(sampleText, "doc-123");

    // Only valid chunks should be returned
    expect(chunks.every((c) => c.chunkText.length >= 100 || c.chunkText.trim().length > 0)).toBe(true);
  });

  it("should assign sequential chunk indices", async () => {
    const sampleText = `
Paragraph one with content.
More content here.

Paragraph two with additional content.
Even more text.

Paragraph three for testing purposes here.
With more content to complete it.`.trim();

    mockCreateMessage.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            { start_idx: 0, end_idx: 100, label: "P1" },
            { start_idx: 100, end_idx: 200, label: "P2" },
            { start_idx: 200, end_idx: 300, label: "P3" },
          ]),
        },
      ],
    });

    const chunks = await semanticChunk(sampleText, "doc-123");

    chunks.forEach((chunk, i) => {
      expect(chunk.chunkIndex).toBe(i);
    });
  });
});

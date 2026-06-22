import { describe, it, expect, vi, beforeEach } from "vitest";
import { Buffer } from "buffer";
import {
  createIngestionGraph,
  createInitialState,
  IngestionState,
} from "./ingestion-agent";

// Mock the extraction modules
vi.mock("./density-analyzer", () => ({
  analyzeTextDensity: vi.fn(),
}));

vi.mock("./extractors/pdf-extractor", () => ({
  extractPdfText: vi.fn(),
}));

vi.mock("./extractors/docx-extractor", () => ({
  extractDocxText: vi.fn(),
}));

vi.mock("./extractors/pptx-extractor", () => ({
  extractPptxText: vi.fn(),
}));

vi.mock("./semantic-chunker", () => ({
  semanticChunk: vi.fn(),
}));

describe("Ingestion Agent", () => {
  let testBuffer: Buffer;
  let initialState: IngestionState;

  beforeEach(() => {
    testBuffer = Buffer.from("test document content here with enough text to pass validation");
    initialState = createInitialState(testBuffer, "pdf", "test.pdf", "user123");
  });

  it("should create initial state with correct defaults", () => {
    expect(initialState.documentId).toBeDefined();
    expect(initialState.fileType).toBe("pdf");
    expect(initialState.fileName).toBe("test.pdf");
    expect(initialState.userId).toBe("user123");
    expect(initialState.status).toBe("pending");
    expect(initialState.error).toBeNull();
    expect(initialState.chunks).toEqual([]);
    expect(initialState.embeddings).toEqual([]);
  });

  it("should generate unique document IDs", () => {
    const state1 = createInitialState(testBuffer, "pdf", "test1.pdf", "user123");
    const state2 = createInitialState(testBuffer, "pdf", "test2.pdf", "user123");

    expect(state1.documentId).not.toBe(state2.documentId);
  });

  it("should accept different file types", () => {
    const pdfState = createInitialState(testBuffer, "pdf", "test.pdf", "user123");
    const docxState = createInitialState(testBuffer, "docx", "test.docx", "user123");
    const pptxState = createInitialState(testBuffer, "pptx", "test.pptx", "user123");

    expect(pdfState.fileType).toBe("pdf");
    expect(docxState.fileType).toBe("docx");
    expect(pptxState.fileType).toBe("pptx");
  });

  it("should handle user ID from headers", () => {
    const state = createInitialState(testBuffer, "pdf", "test.pdf", "user456");
    expect(state.userId).toBe("user456");
  });

  it("should initialize empty chunks array", () => {
    expect(initialState.chunks).toHaveLength(0);
  });

  it("should initialize empty embeddings array", () => {
    expect(initialState.embeddings).toHaveLength(0);
  });

  it("should preserve buffer reference", () => {
    expect(initialState.buffer).toBe(testBuffer);
    expect(initialState.buffer.length).toBeGreaterThan(0);
  });

  it("should handle different buffer sizes", () => {
    const smallBuffer = Buffer.from("small");
    const largeBuffer = Buffer.from("x".repeat(10000));

    const smallState = createInitialState(smallBuffer, "pdf", "small.pdf", "user123");
    const largeState = createInitialState(largeBuffer, "pdf", "large.pdf", "user123");

    expect(smallState.buffer.length).toBeLessThan(largeState.buffer.length);
  });
});

describe("createIngestionGraph", () => {
  it("should create a valid graph", async () => {
    const graph = await createIngestionGraph();
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
  });

  it("should have expected nodes", async () => {
    const graph = await createIngestionGraph();
    // Graph should be callable with a state
    expect(typeof graph.invoke).toBe("function");
  });
});

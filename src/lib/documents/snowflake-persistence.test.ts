import { describe, it, expect, vi, beforeEach } from "vitest";
import { Buffer } from "buffer";
import {
  checkDuplicateInSnowflake,
  generateChunkEmbeddings,
  persistDocument,
  persistChunks,
  markDocumentIndexed,
  completeIngestion,
} from "./snowflake-persistence";
import { IngestionState } from "./ingestion-agent";
import { SemanticChunk } from "./extractors/types";

interface MockSnowflakeClient {
  executeQuery: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
}

describe("Snowflake Persistence", () => {
  let mockClient: MockSnowflakeClient;

  beforeEach(() => {
    mockClient = {
      executeQuery: vi.fn(() => Promise.resolve({ rows: [] })),
    };
  });

  describe("checkDuplicateInSnowflake", () => {
    it("should return true if document hash exists", async () => {
      (mockClient.executeQuery as any).mockResolvedValue({
        rows: [{ DOCUMENT_ID: "doc-123" }],
      });

      const result = await checkDuplicateInSnowflake("abc123", mockClient);

      expect(result).toBe(true);
    });

    it("should return false if document hash not found", async () => {
      (mockClient.executeQuery as any).mockResolvedValue({
        rows: [],
      });

      const result = await checkDuplicateInSnowflake("abc123", mockClient);

      expect(result).toBe(false);
    });

    it("should handle query errors gracefully", async () => {
      (mockClient.executeQuery as any).mockRejectedValue(
        new Error("Query failed")
      );

      const result = await checkDuplicateInSnowflake("abc123", mockClient);

      expect(result).toBe(false); // Fail open
    });
  });

  describe("generateChunkEmbeddings", () => {
    it("should generate embeddings for chunks", async () => {
      const chunks: SemanticChunk[] = [
        {
          chunkText: "Test chunk 1",
          chunkIndex: 0,
          pageNumber: 1,
          sectionLabel: "Section 1",
        },
        {
          chunkText: "Test chunk 2",
          chunkIndex: 1,
          pageNumber: 1,
          sectionLabel: "Section 2",
        },
      ];

      const mockEmbedding = Array(768).fill(0.1);
      (mockClient.executeQuery as any).mockResolvedValue({
        rows: [{ embedding: JSON.stringify(mockEmbedding) }],
      });

      const embeddings = await generateChunkEmbeddings(chunks, mockClient);

      expect(embeddings).toHaveLength(2);
      expect(embeddings[0]).toEqual(mockEmbedding);
    });

    it("should handle embedding generation failures", async () => {
      const chunks: SemanticChunk[] = [
        {
          chunkText: "Test chunk",
          chunkIndex: 0,
          pageNumber: 1,
          sectionLabel: null,
        },
      ];

      (mockClient.executeQuery as any).mockRejectedValue(
        new Error("Embedding failed")
      );

      const embeddings = await generateChunkEmbeddings(chunks, mockClient);

      expect(embeddings[0]).toBeNull(); // Fail open
    });
  });

  describe("persistDocument", () => {
    it("should persist document metadata", async () => {
      const state: IngestionState = {
        documentId: "doc-123",
        buffer: Buffer.from("test"),
        fileType: "pdf",
        fileName: "test.pdf",
        userId: "user123",
        textDensity: 0.15,
        parsingMethod: "pdfmupdf",
        fullText: "Test content with enough text",
        contentHash: "abc123def456",
        isDuplicate: false,
        chunks: [],
        embeddings: [],
        status: "extracted",
        error: null,
        errorDetails: undefined,
      };

      (mockClient.executeQuery as any).mockResolvedValue({ rows: [] });

      const result = await persistDocument(state, mockClient);

      expect(result).toBe("doc-123");
      expect(mockClient.executeQuery).toHaveBeenCalled();
    });

    it("should include correct parameters", async () => {
      const state: IngestionState = {
        documentId: "doc-456",
        buffer: Buffer.from("content"),
        fileType: "docx",
        fileName: "document.docx",
        userId: "user456",
        textDensity: 0.18,
        parsingMethod: "claude_vision",
        fullText: "Full document text here",
        contentHash: "xyz789",
        isDuplicate: false,
        chunks: [
          {
            chunkText: "Chunk 1",
            chunkIndex: 0,
            pageNumber: 1,
            sectionLabel: "Intro",
          },
        ],
        embeddings: [null],
        status: "extracted",
        error: null,
        errorDetails: undefined,
      };

      await persistDocument(state, mockClient);

      const callArgs = (mockClient.executeQuery as any).mock.calls[0];
      expect(callArgs[1]).toContain("doc-456");
      expect(callArgs[1]).toContain("document.docx");
    });

    it("should handle persistence errors", async () => {
      const state: IngestionState = {
        documentId: "doc-fail",
        buffer: Buffer.from("test"),
        fileType: "pdf",
        fileName: "test.pdf",
        userId: "user123",
        textDensity: 0.15,
        parsingMethod: "pdfmupdf",
        fullText: "Test",
        contentHash: "hash",
        isDuplicate: false,
        chunks: [],
        embeddings: [],
        status: "extracted",
        error: null,
        errorDetails: undefined,
      };

      (mockClient.executeQuery as any).mockRejectedValue(
        new Error("Database error")
      );

      await expect(persistDocument(state, mockClient)).rejects.toThrow(
        "Failed to persist document"
      );
    });
  });

  describe("persistChunks", () => {
    it("should persist multiple chunks", async () => {
      const chunks: SemanticChunk[] = [
        {
          chunkText: "Chunk 1",
          chunkIndex: 0,
          pageNumber: 1,
          sectionLabel: "Intro",
        },
        {
          chunkText: "Chunk 2",
          chunkIndex: 1,
          pageNumber: 2,
          sectionLabel: "Body",
        },
      ];

      const embeddings = [Array(768).fill(0.1), Array(768).fill(0.2)];

      (mockClient.executeQuery as any).mockResolvedValue({ rows: [] });

      const result = await persistChunks("doc-123", chunks, embeddings, mockClient);

      expect(result).toBe(2);
    });

    it("should continue on individual chunk failures", async () => {
      const chunks: SemanticChunk[] = [
        {
          chunkText: "Chunk 1",
          chunkIndex: 0,
          pageNumber: 1,
          sectionLabel: null,
        },
        {
          chunkText: "Chunk 2",
          chunkIndex: 1,
          pageNumber: 2,
          sectionLabel: null,
        },
      ];

      const embeddings = [null, null];

      let callCount = 0;
      (mockClient.executeQuery as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error("First chunk failed"));
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await persistChunks("doc-123", chunks, embeddings, mockClient);

      expect(result).toBe(1); // One succeeded despite one failing
    });
  });

  describe("markDocumentIndexed", () => {
    it("should update document status", async () => {
      (mockClient.executeQuery as any).mockResolvedValue({ rows: [] });

      await markDocumentIndexed("doc-123", mockClient);

      expect(mockClient.executeQuery).toHaveBeenCalled();
      const callArgs = (mockClient.executeQuery as any).mock.calls[0];
      expect(callArgs[0]).toContain("STATUS = 'indexed'");
    });

    it("should handle update errors gracefully", async () => {
      (mockClient.executeQuery as any).mockRejectedValue(
        new Error("Update failed")
      );

      // Should not throw
      await expect(
        markDocumentIndexed("doc-123", mockClient)
      ).resolves.toBeUndefined();
    });
  });

  describe("completeIngestion", () => {
    it("should reject duplicates", async () => {
      const state: IngestionState = {
        documentId: "doc-dup",
        buffer: Buffer.from("test"),
        fileType: "pdf",
        fileName: "dup.pdf",
        userId: "user123",
        textDensity: 0.15,
        parsingMethod: "pdfmupdf",
        fullText: "Duplicate content",
        contentHash: "dup-hash",
        isDuplicate: false,
        chunks: [],
        embeddings: [],
        status: "extracted",
        error: null,
        errorDetails: undefined,
      };

      // First call returns a row (duplicate found)
      (mockClient.executeQuery as any).mockResolvedValue({
        rows: [{ DOCUMENT_ID: "existing" }],
      });

      const result = await completeIngestion(state, mockClient);

      expect(result.status).toBe("failed");
      expect(result.error).toContain("duplicate");
    });

    it("should complete ingestion successfully", async () => {
      const state: IngestionState = {
        documentId: "doc-success",
        buffer: Buffer.from("test"),
        fileType: "pdf",
        fileName: "success.pdf",
        userId: "user123",
        textDensity: 0.15,
        parsingMethod: "pdfmupdf",
        fullText: "Test content",
        contentHash: "success-hash",
        isDuplicate: false,
        chunks: [
          {
            chunkText: "Test chunk",
            chunkIndex: 0,
            pageNumber: 1,
            sectionLabel: null,
          },
        ],
        embeddings: [null],
        status: "extracted",
        error: null,
        errorDetails: undefined,
      };

      // Mock no duplicates found, then successful persistence
      (mockClient.executeQuery as any)
        .mockResolvedValueOnce({ rows: [] }) // No duplicate
        .mockResolvedValueOnce({ rows: [] }) // Embedding generation
        .mockResolvedValueOnce({ rows: [] }) // Document insert
        .mockResolvedValueOnce({ rows: [] }) // Chunk insert
        .mockResolvedValueOnce({ rows: [] }); // Mark indexed

      const result = await completeIngestion(state, mockClient);

      expect(result.status).toBe("success");
      expect(result.documentId).toBe("doc-success");
      expect(result.chunksCount).toBeGreaterThan(0);
    });
  });
});

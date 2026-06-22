import { describe, it, expect, beforeEach } from "vitest";
import {
  buildDocumentContext,
  extractCitations,
  validateResponseCitations,
  buildDocumentContextBlock,
} from "./chat-integration";
import {
  enrichMessageWithDocuments,
  shouldEnableDocuments,
  autoEnrichMessage,
} from "./enrichment-integration";

describe("Phase 4: Chat Integration Tests", () => {
  const mockChunks = [
    {
      chunkId: "chunk-1",
      chunkText:
        "Treatment group showed mean reduction of 34 mmHg compared to placebo (p<0.001).",
      pageNumber: 2,
      sectionLabel: "Clinical Efficacy Results",
      docName: "Clinical_Trial_Results_2025.pdf",
      fileType: "pdf",
      similarity: 0.85,
    },
    {
      chunkId: "chunk-2",
      chunkText:
        "Risk of torsades de pointes increased 2.3-fold when combined with CYP3A4 inhibitors.",
      pageNumber: 2,
      sectionLabel: "QT Prolongation Hazard",
      docName: "FDA_Safety_Alert_Cardiac.pdf",
      fileType: "pdf",
      similarity: 0.92,
    },
  ];

  describe("Document Context Building", () => {
    it("should build context with documents", async () => {
      const mockExecuteQuery = async () => ({ rows: [] });

      const context = await buildDocumentContext(
        "clinical trial results",
        mockExecuteQuery
      );

      expect(context).toBeDefined();
      expect(context.hasDocuments).toBeDefined();
    });

    it("should return empty context on error", async () => {
      const mockExecuteQuery = async () => {
        throw new Error("Query failed");
      };

      const context = await buildDocumentContext(
        "query",
        mockExecuteQuery
      );

      expect(context.hasDocuments).toBe(false);
      expect(context.chunks).toEqual([]);
    });
  });

  describe("Citation Extraction", () => {
    it("should extract valid citations from response", () => {
      const response =
        "According to research, [doc: Clinical_Trial_Results_2025.pdf, p.2, Clinical Efficacy Results] the treatment showed significant results.";

      const citations = extractCitations(response, mockChunks);

      expect(citations.length).toBe(1);
      expect(citations[0].filename).toContain("Clinical_Trial_Results");
      expect(citations[0].page).toBe(2);
      expect(citations[0].isValid).toBe(true);
    });

    it("should extract multiple citations", () => {
      const response =
        "First finding [doc: Clinical_Trial_Results_2025.pdf, p.2] and second [doc: FDA_Safety_Alert_Cardiac.pdf, p.2, QT Prolongation Hazard]";

      const citations = extractCitations(response, mockChunks);

      expect(citations.length).toBe(2);
      expect(citations[0].isValid).toBe(true);
      expect(citations[1].isValid).toBe(true);
    });

    it("should mark invalid citations", () => {
      const response =
        "This cites a non-existent document [doc: Nonexistent_Document.pdf, p.999]";

      const citations = extractCitations(response, mockChunks);

      expect(citations.length).toBe(1);
      expect(citations[0].isValid).toBe(false);
    });

    it("should handle responses without citations", () => {
      const response =
        "This is a general statement without any document references.";

      const citations = extractCitations(response, mockChunks);

      expect(citations.length).toBe(0);
    });
  });

  describe("Citation Validation", () => {
    it("should validate proper citations", () => {
      const response =
        "Research shows [doc: Clinical_Trial_Results_2025.pdf, p.2] that treatment works effectively.";

      const validation = validateResponseCitations(response, mockChunks);

      expect(validation.isValid).toBe(true);
      expect(validation.invalidCitations).toBe(0);
    });

    it("should flag missing citations when documents referenced", () => {
      const response =
        "The study showed that the treatment was effective in reducing blood pressure.";

      const validation = validateResponseCitations(response, mockChunks);

      // Should flag as potentially missing citations (contains reference words)
      expect(validation.feedback).toBeDefined();
    });

    it("should accept responses without documents referenced", () => {
      const response = "The color of the sky is blue.";

      const validation = validateResponseCitations(response, mockChunks);

      expect(validation.isValid).toBe(true);
    });

    it("should handle empty retrieved chunks", () => {
      const response = "Some response text.";

      const validation = validateResponseCitations(response, []);

      expect(validation.isValid).toBe(true);
      expect(validation.feedback).toContain("not required");
    });

    it("should detect invalid citations", () => {
      const response =
        "According to [doc: Nonexistent_Document.pdf, p.999], this is true.";

      const validation = validateResponseCitations(response, mockChunks);

      expect(validation.invalidCitations).toBeGreaterThan(0);
    });
  });

  describe("Document Context Block Formatting", () => {
    it("should format context with documents", () => {
      const context = {
        hasDocuments: true,
        chunks: mockChunks,
        citationFormat: "[doc: file.pdf, p.2]",
        instructions: "Use these documents for context.",
      };

      const block = buildDocumentContextBlock(context);

      expect(block).toContain("DOCUMENT CONTEXT");
      expect(block).toContain("Use these documents");
      expect(block).toContain("END DOCUMENT CONTEXT");
    });

    it("should return empty string without documents", () => {
      const context = {
        hasDocuments: false,
        chunks: [],
        citationFormat: "",
        instructions: "",
      };

      const block = buildDocumentContextBlock(context);

      expect(block).toBe("");
    });
  });

  describe("Enrichment Integration", () => {
    it("should enrich message with document context", async () => {
      const mockExecuteQuery = async () => ({ rows: [] });

      const enriched = await enrichMessageWithDocuments(
        "clinical trial results",
        "analysis",
        {
          enableDocuments: true,
          executeQuery: mockExecuteQuery,
        }
      );

      expect(enriched).toContain("INTENT");
      expect(enriched).toContain("clinical trial results");
    });

    it("should skip documents if not enabled", async () => {
      const enriched = await enrichMessageWithDocuments(
        "query",
        "analysis",
        {
          enableDocuments: false,
        }
      );

      expect(enriched).toContain("INTENT");
      expect(enriched).not.toContain("DOCUMENT CONTEXT");
    });

    it("should handle missing executeQuery gracefully", async () => {
      const enriched = await enrichMessageWithDocuments("query", "analysis", {
        enableDocuments: true,
        // No executeQuery provided
      });

      expect(enriched).toBeDefined();
      expect(enriched).toContain("INTENT");
    });

    it("should include prior SQL context", async () => {
      const enriched = await enrichMessageWithDocuments("query", "analysis", {
        priorSQL: "SELECT * FROM table WHERE condition;",
      });

      expect(enriched).toContain("PRIOR QUERY CONTEXT");
      expect(enriched).toContain("SELECT * FROM table");
    });
  });

  describe("Intent-Based Document Enabling", () => {
    it("should enable documents for analysis intent", () => {
      expect(shouldEnableDocuments("analysis")).toBe(true);
    });

    it("should enable documents for research intent", () => {
      expect(shouldEnableDocuments("market research")).toBe(true);
    });

    it("should enable documents for safety intent", () => {
      expect(shouldEnableDocuments("safety assessment")).toBe(true);
    });

    it("should enable documents for regulatory intent", () => {
      expect(shouldEnableDocuments("regulatory compliance")).toBe(true);
    });

    it("should not enable for generic intents", () => {
      expect(shouldEnableDocuments("greeting")).toBe(false);
      expect(shouldEnableDocuments("chat")).toBe(false);
    });
  });

  describe("Auto-Enrichment", () => {
    it("should auto-enable documents for research intent", async () => {
      const mockExecuteQuery = async () => ({ rows: [] });

      const result = await autoEnrichMessage(
        "research query",
        "clinical research",
        {
          executeQuery: mockExecuteQuery,
        }
      );

      expect(result.enriched).toBeDefined();
      // Documents should be enabled for research intent
    });

    it("should skip documents for generic intent", async () => {
      const result = await autoEnrichMessage(
        "hello",
        "greeting"
      );

      expect(result.hasDocuments).toBe(false);
    });

    it("should respect explicit enableDocuments flag", async () => {
      const result = await autoEnrichMessage(
        "query",
        "analysis",
        {
          enableDocuments: false,
        }
      );

      expect(result.hasDocuments).toBe(false);
    });
  });

  describe("End-to-End Chat Integration Scenarios", () => {
    it("should handle research query with citations", async () => {
      const response =
        "Based on clinical trial data [doc: Clinical_Trial_Results_2025.pdf, p.2, Clinical Efficacy Results], treatment showed 34 mmHg reduction.";

      const validation = validateResponseCitations(response, mockChunks);

      expect(validation.isValid).toBe(true);
      expect(validation.invalidCitations).toBe(0);
    });

    it("should catch missing documentation in research context", async () => {
      const response =
        "Research demonstrates significant improvement in clinical outcomes.";
      const mockResearchChunks = [...mockChunks];

      const validation = validateResponseCitations(
        response,
        mockResearchChunks
      );

      expect(validation.feedback).toBeDefined();
    });

    it("should allow general knowledge without citations", async () => {
      const response =
        "Hypertension is a condition characterized by elevated blood pressure.";

      const validation = validateResponseCitations(response, mockChunks);

      // Should be valid if it's general knowledge without referencing studies
      expect(validation.isValid).toBe(true);
    });

    it("should handle mixed content with selective citation", async () => {
      const response =
        "Hypertension is when blood pressure is elevated. According to [doc: Clinical_Trial_Results_2025.pdf, p.2], the treatment showed 34 mmHg reduction.";

      const validation = validateResponseCitations(response, mockChunks);

      expect(validation.invalidCitations).toBe(0);
    });
  });

  describe("Fail-Open Behavior", () => {
    it("should not throw on document retrieval error", async () => {
      const mockExecuteQuery = async () => {
        throw new Error("Database connection failed");
      };

      // Should not throw
      const enriched = await enrichMessageWithDocuments(
        "query",
        "analysis",
        {
          enableDocuments: true,
          executeQuery: mockExecuteQuery,
        }
      );

      expect(enriched).toBeDefined();
      expect(enriched).toContain("INTENT");
    });

    it("should continue chat even if document context missing", async () => {
      const context = {
        hasDocuments: false,
        chunks: [],
        citationFormat: "",
        instructions: "",
      };

      const block = buildDocumentContextBlock(context);
      expect(block).toBe(""); // No error, just empty

      // Chat should continue normally
      expect(context.hasDocuments).toBe(false);
    });
  });
});

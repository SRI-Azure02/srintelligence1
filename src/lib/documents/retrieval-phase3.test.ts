import { describe, it, expect, vi, beforeEach } from "vitest";
import { routeQuery, extractKeywords } from "./query-router-agent";
import { validateContext, refineQuery } from "./validator-agent";
import { executeRetrieval } from "./retrieval-orchestrator";

// Mock Anthropic API
vi.mock("@anthropic-ai/sdk", () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

describe("Phase 3: Hybrid Retrieval Tests", () => {
  let mockExecuteQuery: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteQuery = vi.fn(async () => ({ rows: [] }));
  });

  describe("Query Router - Scenario 1: Negation Fixing", () => {
    it("should handle 'Find drugs WITHOUT side effects' query", async () => {
      const query = "Find drugs WITHOUT side effects";
      const keywords = extractKeywords(query);

      expect(keywords).toContain("drugs");
      expect(keywords).toContain("side");
      expect(keywords).toContain("effects");
      expect(keywords).not.toContain("without");
    });

    it("should handle 'Avoid NSAIDs with warfarin' query", async () => {
      const query = "Avoid NSAIDs with warfarin";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.some((kw) =>
        ["nsaid", "warfarin"].includes(kw.toLowerCase())
      )).toBe(true);
    });

    it("should expand 'drug interactions' keywords", async () => {
      const query = "drug interactions";
      const keywords = extractKeywords(query);

      expect(keywords).toContain("drug");
      expect(keywords).toContain("interactions");
    });
  });

  describe("Query Router - Scenario 2: Type Conversion", () => {
    it("should handle passive voice 'side effects that are reported'", async () => {
      const query = "side effects that are reported";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.some((kw) => kw.includes("side") || kw.includes("effect"))).toBe(true);
    });

    it("should handle 'QT prolongation risks' query", async () => {
      const query = "QT prolongation risks";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);
    });
  });

  describe("Query Router - Scenario 3: Keyword Expansion", () => {
    it("should expand 'cardiac safety' domain keywords", async () => {
      const query = "cardiac safety";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.some((kw) => ["cardiac", "safety"].includes(kw))).toBe(true);
    });

    it("should handle 'clinical trial results' query", async () => {
      const query = "clinical trial results";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.some((kw) =>
        ["clinical", "trial", "results"].includes(kw)
      )).toBe(true);
    });

    it("should handle 'manufacturing quality standards' query", async () => {
      const query = "manufacturing quality standards";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);
    });
  });

  describe("Validator - Scenario 1: Clinical Trial Retrieval", () => {
    it("should validate clinical trial efficacy data", async () => {
      const query = "clinical trial results cardiovascular";
      const mockChunks = [
        {
          chunkId: "chunk-1",
          chunkText:
            "Treatment group showed mean reduction of 34 mmHg compared to placebo (p<0.001). Mortality reduction showed 22% lower all-cause mortality.",
          pageNumber: 2,
          sectionLabel: "Clinical Efficacy Results",
          docName: "Clinical_Trial_Results_2025.pdf",
          fileType: "pdf",
          similarity: 0.85,
        },
      ];

      const validation = await validateContext(query, mockChunks);

      expect(validation).toBeDefined();
      expect(validation.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(validation.coverageScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Validator - Scenario 2: Safety Alert Retrieval", () => {
    it("should validate cardiac safety concerns", async () => {
      const query = "QT prolongation cardiac safety alerts";
      const mockChunks = [
        {
          chunkId: "chunk-2",
          chunkText:
            "Post-marketing surveillance identified cases of torsades de pointes. Risk of torsades de pointes increased 2.3-fold when combined with CYP3A4 inhibitors.",
          pageNumber: 2,
          sectionLabel: "QT Prolongation Hazard",
          docName: "FDA_Safety_Alert_Cardiac.pdf",
          fileType: "pdf",
          similarity: 0.92,
        },
      ];

      const validation = await validateContext(query, mockChunks);

      expect(validation).toBeDefined();
      expect(typeof validation.relevanceScore).toBe("number");
      expect(typeof validation.coverageScore).toBe("number");
    });
  });

  describe("Validator - Scenario 3: Drug Interactions Retrieval", () => {
    it("should validate warfarin-NSAID interaction", async () => {
      const query = "warfarin NSAID bleeding risk";
      const mockChunks = [
        {
          chunkId: "chunk-3",
          chunkText:
            "Combined effect results in 5-fold increase in major bleeding events. NSAIDs displace warfarin from plasma proteins causing enhanced effect.",
          pageNumber: 2,
          sectionLabel: "Critical Interactions",
          docName: "Comprehensive_Drug_Interaction_Guide.pdf",
          fileType: "pdf",
          similarity: 0.88,
        },
      ];

      const validation = await validateContext(query, mockChunks);

      expect(validation).toBeDefined();
      expect(validation.isValid).toBeDefined();
      expect(validation.shouldRetry).toBeDefined();
    });

    it("should validate methotrexate-NSAID interaction", async () => {
      const query = "methotrexate NSAID renal failure";
      const mockChunks = [
        {
          chunkId: "chunk-4",
          chunkText:
            "NSAIDs decrease GFR by 20-40%, reducing methotrexate clearance significantly. Acute renal failure can occur within days.",
          pageNumber: 3,
          sectionLabel: "Renal-Compromising Interactions",
          docName: "Comprehensive_Drug_Interaction_Guide.pdf",
          fileType: "pdf",
          similarity: 0.86,
        },
      ];

      const validation = await validateContext(query, mockChunks);

      expect(validation).toBeDefined();
      expect(validation.feedback).toBeDefined();
    });

    it("should validate ACE inhibitor-potassium interaction", async () => {
      const query = "ACE inhibitor potassium supplement hyperkalemia";
      const mockChunks = [
        {
          chunkId: "chunk-5",
          chunkText:
            "ACE inhibitor effect: Decreased aldosterone reduces potassium excretion leading to retention. Hyperkalemia definition: Serum potassium >5.5 mEq/L.",
          pageNumber: 4,
          sectionLabel: "Electrolyte Interactions",
          docName: "Comprehensive_Drug_Interaction_Guide.pdf",
          fileType: "pdf",
          similarity: 0.84,
        },
      ];

      const validation = await validateContext(query, mockChunks);

      expect(validation).toBeDefined();
    });
  });

  describe("Validator - Scenario 4: Market Analysis Retrieval", () => {
    it("should validate oncology market data", async () => {
      const query = "oncology market size growth pembrolizumab";
      const mockChunks = [
        {
          chunkId: "chunk-6",
          chunkText:
            "Market reached $187 billion in H1 2025. Pembrolizumab (Merck) leads checkpoint space with $8.2B sales.",
          pageNumber: 2,
          sectionLabel: "Market Overview",
          docName: "Oncology_Market_Analysis_H1_2025.docx",
          fileType: "docx",
          similarity: 0.90,
        },
      ];

      const validation = await validateContext(query, mockChunks);

      expect(validation).toBeDefined();
      expect(typeof validation.relevanceScore).toBe("number");
    });
  });

  describe("Retrieval Orchestrator - 3-Cycle Retry Loop", () => {
    it("should execute retrieval workflow", async () => {
      const query = "clinical trial efficacy blood pressure reduction";

      const result = await executeRetrieval(query, mockExecuteQuery);

      expect(result).toBeDefined();
      expect(result.chunks).toBeDefined();
      expect(Array.isArray(result.chunks)).toBe(true);
      expect(result.cycles).toBeGreaterThanOrEqual(1);
      expect(result.cycles).toBeLessThanOrEqual(3);
    });

    it("should handle empty result set", async () => {
      const emptyQueryFn = async () => ({ rows: [] });
      const query = "nonexistent drug compound XYZ-9999";

      const result = await executeRetrieval(query, emptyQueryFn);

      expect(result.chunks).toBeDefined();
      expect(Array.isArray(result.chunks)).toBe(true);
    });

    it("should respect max 3 cycles", async () => {
      const query = "complex pharmaceutical query requiring optimization";
      const result = await executeRetrieval(query, mockExecuteQuery);

      expect(result.cycles).toBeLessThanOrEqual(3);
    });
  });

  describe("End-to-End Retrieval Scenarios", () => {
    it("should handle 'Find clinical trial results for cardiovascular drugs'", async () => {
      const query = "Find clinical trial results for cardiovascular drugs";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.some((kw) =>
        ["clinical", "trial", "results", "cardiovascular"].includes(kw)
      )).toBe(true);

      const result = await executeRetrieval(query, mockExecuteQuery);
      expect(result.cycles).toBeGreaterThanOrEqual(1);
    });

    it("should handle 'Search for safety concerns without adverse effects listed'", async () => {
      const query = "Search for safety concerns without adverse effects listed";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);

      const result = await executeRetrieval(query, mockExecuteQuery);
      expect(result).toBeDefined();
    });

    it("should handle 'Drug interactions and contraindications'", async () => {
      const query = "Drug interactions and contraindications";
      const keywords = extractKeywords(query);

      expect(keywords.some((kw) =>
        ["drug", "interactions", "contraindications"].includes(kw)
      )).toBe(true);

      const result = await executeRetrieval(query, mockExecuteQuery);
      expect(result.chunks).toBeDefined();
    });

    it("should handle 'Market analysis for oncology products'", async () => {
      const query = "Market analysis for oncology products";
      const keywords = extractKeywords(query);

      expect(keywords.some((kw) =>
        ["market", "analysis", "oncology", "products"].includes(kw)
      )).toBe(true);

      const result = await executeRetrieval(query, mockExecuteQuery);
      expect(result.cycles).toBeGreaterThanOrEqual(1);
    });

    it("should handle 'Manufacturing quality standards and cGMP requirements'", async () => {
      const query = "Manufacturing quality standards and cGMP requirements";
      const keywords = extractKeywords(query);

      expect(keywords.length).toBeGreaterThan(0);

      const result = await executeRetrieval(query, mockExecuteQuery);
      expect(result).toBeDefined();
    });
  });

  describe("Validator - Edge Cases", () => {
    it("should handle empty chunk list", async () => {
      const validation = await validateContext("test query", []);

      expect(validation.isValid).toBe(false);
      expect(validation.shouldRetry).toBe(true);
    });

    it("should handle single chunk", async () => {
      const query = "single result query";
      const chunk = {
        chunkId: "single-1",
        chunkText: "This is a single retrieved chunk of text.",
        pageNumber: 1,
        sectionLabel: "Test",
        docName: "test.pdf",
        fileType: "pdf",
        similarity: 0.75,
      };

      const validation = await validateContext(query, [chunk]);

      expect(validation).toBeDefined();
      expect(typeof validation.relevanceScore).toBe("number");
    });

    it("should handle multiple chunks from same document", async () => {
      const query = "comprehensive query";
      const chunks = [
        {
          chunkId: "chunk-a",
          chunkText: "First part of the document",
          pageNumber: 1,
          sectionLabel: "Section A",
          docName: "same.pdf",
          fileType: "pdf",
          similarity: 0.8,
        },
        {
          chunkId: "chunk-b",
          chunkText: "Second part of the document",
          pageNumber: 2,
          sectionLabel: "Section B",
          docName: "same.pdf",
          fileType: "pdf",
          similarity: 0.75,
        },
      ];

      const validation = await validateContext(query, chunks);

      expect(validation).toBeDefined();
      expect(validation.coverageScore).toBeGreaterThanOrEqual(0);
    });
  });
});

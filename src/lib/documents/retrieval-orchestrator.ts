import { StateGraph } from "@langchain/langgraph";
import { routeQuery } from "./query-router-agent";
import { hybridSearch, RetrievedChunk } from "./hybrid-search";
import {
  validateContext,
  refineQuery,
  ValidationResult,
} from "./validator-agent";

export interface RetrievalState {
  originalQuery: string;
  currentQuery: string;
  cycle: number;
  chunks: RetrievedChunk[];
  validation: ValidationResult | null;
  status: "routing" | "searching" | "validating" | "refining" | "complete" | "failed";
  error: string | null;
}

/**
 * Agentic Retrieval Orchestrator: 3-cycle optimization loop
 *
 * Cycle Flow:
 * 1. Route query (negation fix, keyword expansion)
 * 2. Hybrid search (vector + keyword with RRF)
 * 3. Validate context (relevance & coverage)
 * 4. If invalid and cycles remain: Refine query and retry
 * 5. Otherwise: Return best results
 */
export async function createRetrievalGraph() {
  const graph = new StateGraph(RetrievalState);

  /**
   * Stage 1: Route the user query
   */
  const routeQueryNode = async (state: RetrievalState): Promise<RetrievalState> => {
    try {
      const routed = await routeQuery(state.originalQuery);
      return {
        ...state,
        currentQuery: routed.finalQuery,
        status: "searching",
      };
    } catch (error) {
      return {
        ...state,
        currentQuery: state.originalQuery,
        status: "searching",
        error: `Routing failed: ${error}`,
      };
    }
  };

  /**
   * Stage 2: Hybrid search
   */
  const searchNode = async (
    state: RetrievalState,
    executeQuery: (sql: string, params?: any[]) => Promise<{ rows: any[] }>
  ): Promise<RetrievalState> => {
    try {
      const chunks = await hybridSearch(
        state.currentQuery,
        executeQuery,
        10
      );
      return {
        ...state,
        chunks: chunks.slice(0, 10),
        status: "validating",
      };
    } catch (error) {
      return {
        ...state,
        chunks: [],
        status: "validating",
        error: `Search failed: ${error}`,
      };
    }
  };

  /**
   * Stage 3: Validate context quality
   */
  const validateNode = async (state: RetrievalState): Promise<RetrievalState> => {
    try {
      const validation = await validateContext(
        state.originalQuery,
        state.chunks
      );
      return {
        ...state,
        validation,
        status: validation.shouldRetry && state.cycle < 3 ? "refining" : "complete",
      };
    } catch (error) {
      return {
        ...state,
        status: "complete",
        error: `Validation failed: ${error}`,
      };
    }
  };

  /**
   * Stage 4: Refine query if needed
   */
  const refineNode = async (state: RetrievalState): Promise<RetrievalState> => {
    if (!state.validation || state.cycle >= 3) {
      return { ...state, status: "complete" };
    }

    try {
      const refined = await refineQuery(
        state.currentQuery,
        state.validation.feedback,
        state.cycle
      );

      return {
        ...state,
        currentQuery: refined,
        cycle: state.cycle + 1,
        status: "searching", // Loop back to search
        chunks: [], // Clear previous results
        validation: null,
      };
    } catch (error) {
      return {
        ...state,
        status: "complete",
        error: `Refinement failed: ${error}`,
      };
    }
  };

  // Add nodes
  graph
    .addNode("route_query", routeQueryNode)
    .addNode("validate", validateNode)
    .addNode("refine", refineNode);

  // Add edges
  graph.addEdge("route_query", "validate");
  graph.addConditionalEdges(
    "validate",
    (state) => (state.validation?.shouldRetry && state.cycle < 3 ? "refine" : "complete"),
    { refine: "refine", complete: "END" }
  );
  graph.addEdge("refine", "validate");

  return graph.compile();
}

/**
 * Execute retrieval with 3-cycle retry loop
 */
export async function executeRetrieval(
  query: string,
  executeQuery: (sql: string, params?: any[]) => Promise<{ rows: any[] }>
): Promise<{ chunks: RetrievedChunk[]; cycles: number; validation: ValidationResult }> {
  let state: RetrievalState = {
    originalQuery: query,
    currentQuery: query,
    cycle: 1,
    chunks: [],
    validation: null,
    status: "routing",
    error: null,
  };

  const maxCycles = 3;

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    // Step 1: Route query
    state = await routeQuery(state.currentQuery).then((routed) => ({
      ...state,
      currentQuery: routed.finalQuery,
    }));

    // Step 2: Hybrid search
    try {
      const chunks = await hybridSearch(state.currentQuery, executeQuery, 10);
      state = { ...state, chunks };
    } catch (error) {
      console.warn(`Search cycle ${cycle + 1} failed: ${error}`);
    }

    // Step 3: Validate
    const validation = await validateContext(state.originalQuery, state.chunks);
    state = { ...state, validation };

    // Step 4: Check if valid or out of cycles
    if (validation.isValid || cycle === maxCycles - 1) {
      return {
        chunks: state.chunks,
        cycles: cycle + 1,
        validation,
      };
    }

    // Step 5: Refine and retry
    try {
      const refined = await refineQuery(
        state.currentQuery,
        validation.feedback,
        cycle + 1
      );
      state = { ...state, currentQuery: refined };
    } catch (error) {
      console.warn(`Query refinement failed: ${error}`);
      break;
    }
  }

  return {
    chunks: state.chunks,
    cycles: maxCycles,
    validation: state.validation || {
      isValid: false,
      relevanceScore: 0,
      coverageScore: 0,
      shouldRetry: false,
      feedback: "Max cycles reached",
    },
  };
}

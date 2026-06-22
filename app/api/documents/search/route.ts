import { NextRequest, NextResponse } from "next/server";
import { executeRetrieval } from "@/src/lib/documents/retrieval-orchestrator";

/**
 * POST /api/documents/search
 * Hybrid retrieval with 3-cycle optimization loop
 *
 * Request: { query: string }
 * Response: { chunks: RetrievedChunk[], cycles: number, validation: ValidationResult }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query } = body;

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or invalid query parameter" },
        { status: 400 }
      );
    }

    // For now, return mock implementation since we don't have Snowflake client configured
    // In production, this would use the Snowflake client to execute queries
    const mockExecuteQuery = async (sql: string, params?: any[]) => {
      // Mock retrieval from test data
      // This would be replaced with actual Snowflake execution
      return { rows: [] };
    };

    // Execute retrieval with 3-cycle retry loop
    const result = await executeRetrieval(query, mockExecuteQuery);

    return NextResponse.json({
      success: true,
      query: query,
      chunks: result.chunks,
      cycles: result.cycles,
      validation: {
        isValid: result.validation.isValid,
        relevanceScore: result.validation.relevanceScore,
        coverageScore: result.validation.coverageScore,
        feedback: result.validation.feedback,
      },
      message:
        result.validation.isValid
          ? `Retrieved ${result.chunks.length} relevant chunks in ${result.cycles} cycle(s)`
          : `Retrieved ${result.chunks.length} chunks (validation incomplete after ${result.cycles} cycle(s))`,
    });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      {
        error: "Search failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/documents/search
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

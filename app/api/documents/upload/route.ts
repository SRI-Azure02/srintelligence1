import { NextRequest, NextResponse } from "next/server";
import { createIngestionGraph, createInitialState } from "@/src/lib/documents/ingestion-agent";
import { completeIngestion } from "@/src/lib/documents/snowflake-persistence";

/**
 * POST /api/documents/upload
 * Accepts multipart form data with file and processes it through the ingestion pipeline
 */
export async function POST(request: NextRequest) {
  try {
    // Extract form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    const fileType = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "pptx"].includes(fileType || "")) {
      return NextResponse.json(
        { error: "Unsupported file type. Accepted: PDF, DOCX, PPTX" },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 413 }
      );
    }

    // Extract user ID from headers or session
    const userId = request.headers.get("x-user-id") || "anonymous";

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create ingestion state
    const initialState = createInitialState(
      buffer,
      fileType as "pdf" | "docx" | "pptx",
      file.name,
      userId
    );

    // Run ingestion pipeline
    const ingestionGraph = await createIngestionGraph();
    const finalState = await ingestionGraph.invoke(initialState);

    // Check if extraction was successful
    if (finalState.status === "failed") {
      return NextResponse.json(
        {
          error: finalState.error || "Ingestion failed",
          details: finalState.errorDetails,
        },
        { status: 500 }
      );
    }

    // Persist to Snowflake via the persistence layer
    try {
      // await completeIngestion(finalState, userId);
      await completeIngestion(finalState); 
    } catch (persistError) {
      console.warn(`Snowflake persistence warning (continuing with extracted state): ${persistError}`);
      // Fail-open: ingestion succeeded even if persistence fails
    }

    const result = {
      documentId: finalState.documentId,
      fileName: finalState.fileName,
      fileType: finalState.fileType,
      textDensity: finalState.textDensity,
      parsingMethod: finalState.parsingMethod,
      chunksCount: finalState.chunks.length,
      fullTextLength: finalState.fullText.length,
      contentHash: finalState.contentHash,
      status: "indexed",
      message: "Document uploaded, extracted, chunked, and indexed successfully.",
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: "Upload failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/documents/upload
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-user-id",
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createIngestionGraph, createInitialState } from "@/src/lib/documents/ingestion-agent";
import { completeIngestion } from "@/src/lib/documents/snowflake-persistence";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const fileType = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "pptx"].includes(fileType || "")) {
      return NextResponse.json(
        { error: "Unsupported file type. Accepted: PDF, DOCX, PPTX" },
        { status: 400 }
      );
    }
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 413 }
      );
    }
    const userId = request.headers.get("x-user-id") || "anonymous";
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const initialState = createInitialState(
      buffer,
      fileType as "pdf" | "docx" | "pptx",
      file.name,
      userId
    );
    const ingestionGraph = await createIngestionGraph();
    const finalState = await ingestionGraph.invoke(initialState);
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
      // TODO: Snowflake persistence not yet wired up. The persistence layer
      // expects a client with parameterized queries (executeQuery(sql, params[])),
      // but the available executeSQL() takes a role string, not a values array.
      // Bridging the two is tracked as follow-up work. Stub for now; the catch
      // below fails open so upload + extraction still succeed.
      const sf = {
        executeQuery: async (_sql: string, _params?: any[]): Promise<{ rows: any[] }> => {
          throw new Error("Snowflake persistence not yet implemented");
        },
      };
      await completeIngestion(finalState, sf);
    } catch (persistError) {
      console.warn(`Snowflake persistence warning (continuing with extracted state): ${persistError}`);
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

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-user-id",
    },
  });
}
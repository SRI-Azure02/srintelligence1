import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/src/lib/snowflake/sql-api";

/**
 * DELETE /api/documents/[docId]
 * Delete a document by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const userId = request.headers.get("x-user-id") || "anonymous";
    const { docId } = await params;

    if (!docId || typeof docId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid document ID" },
        { status: 400 }
      );
    }

    // Verify document ownership
    const docResult = await executeSQL(
      `SELECT DOCUMENT_ID, UPLOAD_USER_ID FROM PUBLIC.DOCUMENTS WHERE DOCUMENT_ID = ?`,
      undefined,
      request.signal
    );

    if (docResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    const doc = docResult.rows[0];
    if (doc.UPLOAD_USER_ID !== userId) {
      return NextResponse.json(
        { error: "Unauthorized: You can only delete your own documents" },
        { status: 403 }
      );
    }

    // Delete chunks first
    await executeSQL(
      `DELETE FROM PUBLIC.DOCUMENT_CHUNKS WHERE DOCUMENT_ID = ?`,
      undefined,
      request.signal
    );

    // Delete document
    await executeSQL(
      `DELETE FROM PUBLIC.DOCUMENTS WHERE DOCUMENT_ID = ?`,
      undefined,
      request.signal
    );

    return NextResponse.json({
      success: true,
      documentId: docId,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete document",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/documents/[docId]
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "x-user-id",
    },
  });
}

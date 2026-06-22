import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/src/lib/snowflake/sql-api";

/**
 * GET /api/documents/list
 * Retrieve all documents uploaded by the user
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id") || "anonymous";

    // Query Snowflake for documents
    const result = await executeSQL(
      `SELECT
        DOCUMENT_ID, FILE_NAME, FILE_TYPE, FILE_SIZE_BYTES, TEXT_DENSITY,
        PARSING_METHOD, UPLOAD_USER_ID, UPLOADED_AT, STATUS
      FROM PUBLIC.DOCUMENTS
      WHERE UPLOAD_USER_ID = ? OR ? = 'admin'
      ORDER BY UPLOADED_AT DESC
      LIMIT 100`,
      undefined,
      request.signal
    );

    // Parse the results
    const documents = result.rows.map((row) => ({
      DOCUMENT_ID: row.DOCUMENT_ID as string,
      FILE_NAME: row.FILE_NAME as string,
      FILE_TYPE: row.FILE_TYPE as string,
      FILE_SIZE_BYTES: Number(row.FILE_SIZE_BYTES) || 0,
      TEXT_DENSITY: Number(row.TEXT_DENSITY) || 0,
      PARSING_METHOD: row.PARSING_METHOD as string,
      UPLOAD_USER_ID: row.UPLOAD_USER_ID as string,
      UPLOADED_AT: row.UPLOADED_AT as string,
      STATUS: row.STATUS as string,
    }));

    return NextResponse.json({
      success: true,
      documents,
      count: documents.length,
    });
  } catch (error) {
    console.error("List documents error:", error);
    return NextResponse.json(
      {
        error: "Failed to list documents",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/documents/list
 * Handle CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "x-user-id",
    },
  });
}

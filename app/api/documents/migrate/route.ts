import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/src/lib/snowflake/sql-api";

/**
 * POST /api/documents/migrate
 * Add new columns to DOCUMENTS table (one-time migration)
 */
export async function POST(request: NextRequest) {
  try {
    // Try to add the new columns (ignore errors if they already exist)
    try {
      await executeSQL(
        `ALTER TABLE PUBLIC.DOCUMENTS ADD COLUMN THERAPY_AREA VARCHAR(256)`,
        undefined,
        request.signal
      );
    } catch (e) {
      // Column might already exist
    }

    try {
      await executeSQL(
        `ALTER TABLE PUBLIC.DOCUMENTS ADD COLUMN INDICATION VARCHAR(256)`,
        undefined,
        request.signal
      );
    } catch (e) {
      // Column might already exist
    }

    try {
      await executeSQL(
        `ALTER TABLE PUBLIC.DOCUMENTS ADD COLUMN BRAND VARCHAR(256)`,
        undefined,
        request.signal
      );
    } catch (e) {
      // Column might already exist
    }

    return NextResponse.json({
      success: true,
      message: "Database migration completed",
    });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json(
      {
        error: "Failed to migrate database",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/src/lib/snowflake/sql-api";

/**
 * POST /api/documents/seed
 * Seed the database with sample documents (development only)
 */
export async function POST(request: NextRequest) {
  try {
    // Insert 3 sample documents
    const sampleDocs = [
      {
        fileName: "Ozempic_Phase3_Trial_Results_Q2_2026.pdf",
        size: 2457600,
        therapyArea: "Endocrinology",
        indication: "Type 2 Diabetes Mellitus",
        brand: "Ozempic (semaglutide)",
      },
      {
        fileName: "Keytruda_Safety_Analysis_2026.docx",
        size: 1843200,
        therapyArea: "Oncology",
        indication: "Melanoma, Non-Small Cell Lung Cancer",
        brand: "Keytruda (pembrolizumab)",
      },
      {
        fileName: "Humira_Manufacturing_Report_H1_2026.pptx",
        size: 3276800,
        therapyArea: "Rheumatology",
        indication: "Rheumatoid Arthritis, Crohn's Disease",
        brand: "Humira (adalimumab)",
      },
    ];

    for (const doc of sampleDocs) {
      await executeSQL(
        `INSERT INTO PUBLIC.DOCUMENTS (
          FILE_NAME, FILE_TYPE, FILE_SIZE_BYTES, FULL_TEXT, PAGES_COUNT,
          TEXT_DENSITY, PARSING_METHOD, UPLOAD_USER_ID, UPLOADED_AT, INDEXED_AT,
          BASE_WEIGHT, DECAY_LAMBDA, STATUS
        )
        VALUES (
          '${doc.fileName.replace(/'/g, "''")}',
          '${doc.fileName.split(".").pop()?.toLowerCase() || "pdf"}',
          ${doc.size},
          'Sample document content for demonstration purposes.',
          ${Math.floor(doc.size / 20000)},
          0.75,
          'pdfmupdf',
          'current-user',
          CURRENT_TIMESTAMP(),
          CURRENT_TIMESTAMP(),
          1.2,
          0.05,
          'indexed'
        )`,
        undefined,
        request.signal
      );
    }

    return NextResponse.json({
      success: true,
      message: "Sample documents inserted successfully",
      count: sampleDocs.length,
    });
  } catch (error) {
    console.error("Seed documents error:", error);
    return NextResponse.json(
      {
        error: "Failed to seed documents",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

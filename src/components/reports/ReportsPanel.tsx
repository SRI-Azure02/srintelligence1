"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, RefreshCw, Loader2, Trash2, FileText, Search, X } from "lucide-react";

// ── Brand tokens ──────────────────────────────────────────────────────────────

const INK = "#1A3358";
const ACCENT = "#E26B2C";
const BG = "#F5F5F5";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentRow {
  DOCUMENT_ID: string;
  FILE_NAME: string;
  FILE_TYPE: string;
  FILE_SIZE_BYTES: number;
  TEXT_DENSITY: number;
  PARSING_METHOD: string;
  UPLOAD_USER_ID: string;
  UPLOADED_AT: string;
  STATUS: string;
}

interface UploadResult {
  documentId: string;
  fileName: string;
  fileType: string;
  chunksCount: number;
  status: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  userId?: string;
}

export default function ReportsPanel({ userId = "current-user" }: Props) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name">("newest");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── API calls ─────────────────────────────────────────────────────────────

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/documents/list", {
        headers: {
          "x-user-id": userId,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    // Validate file type
    const fileType = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "pptx"].includes(fileType || "")) {
      setError("Only PDF, DOCX, and PPTX files are supported");
      return;
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      setError("File size exceeds 50MB limit");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        headers: {
          "x-user-id": userId,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const result: UploadResult = await response.json();

      // Success! Refresh document list
      await fetchDocuments();
      setError(null);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const response = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: {
          "x-user-id": userId,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete document");
      }

      // Refresh list
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // ── Filtering and sorting ─────────────────────────────────────────────────

  const filteredDocs = documents.filter((doc) =>
    doc.FILE_NAME.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedDocs = [...filteredDocs].sort((a, b) => {
    if (sortBy === "newest") {
      return new Date(b.UPLOADED_AT).getTime() - new Date(a.UPLOADED_AT).getTime();
    } else if (sortBy === "oldest") {
      return new Date(a.UPLOADED_AT).getTime() - new Date(b.UPLOADED_AT).getTime();
    } else {
      return a.FILE_NAME.localeCompare(b.FILE_NAME);
    }
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchDocuments();
  }, [userId]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG }}>
      {/* Masthead */}
      <div style={{ borderTop: `3px double ${INK}`, paddingTop: "5px" }}>
        <div
          style={{
            borderTop: `1px solid ${INK}`,
            paddingTop: "4px",
            paddingBottom: "4px",
            textAlign: "center",
            position: "relative",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
              fontSize: "12px",
              fontWeight: 800,
              letterSpacing: "0.38em",
              textTransform: "uppercase",
              color: INK,
            }}
          >
            Document Repository
          </span>
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              transform: "translateY(-50%)",
              display: "flex",
              gap: "8px",
              paddingRight: "16px",
            }}
          >
            <button
              onClick={() => fetchDocuments()}
              disabled={loading}
              title="Refresh documents"
              className="p-1 hover:bg-black/5 rounded transition-colors"
            >
              <RefreshCw size={14} color={INK} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Upload document"
              className="p-1 hover:bg-black/5 rounded transition-colors"
            >
              <Upload size={14} color={uploading ? ACCENT : INK} />
            </button>
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${INK}` }} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col px-6 pt-4">
        {/* Error banner */}
        {error && (
          <div
            className="mb-4 p-3 rounded-lg flex items-center justify-between"
            style={{ background: "#FEE2E2", border: `1px solid #FCA5A5` }}
          >
            <span style={{ color: "#B91C1C", fontSize: "13px" }}>{error}</span>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-white/50 rounded transition-colors"
            >
              <X size={14} color="#B91C1C" />
            </button>
          </div>
        )}

        {/* Search and sort bar */}
        <div className="flex gap-3 mb-4">
          <div
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ border: `1px solid ${INK}20`, background: "#fff" }}
          >
            <Search size={14} style={{ color: `${INK}55` }} />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                border: "none",
                background: "transparent",
                color: INK,
                fontSize: "13px",
              }}
            />
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              padding: "6px 10px",
              fontSize: "12px",
              borderRadius: "6px",
              border: `1px solid ${INK}20`,
              background: "#fff",
              color: INK,
              fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
              fontWeight: 600,
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">By name</option>
          </select>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
            </div>
          ) : sortedDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <FileText size={40} style={{ color: `${INK}30`, marginBottom: "12px" }} />
              <p style={{ color: INK, fontWeight: 600, marginBottom: "4px" }}>
                {searchQuery ? "No documents found" : "No documents yet"}
              </p>
              <p style={{ color: `${INK}55`, fontSize: "13px" }}>
                {searchQuery
                  ? "Try a different search term"
                  : "Upload a PDF, DOCX, or PPTX file to get started"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedDocs.map((doc) => (
                <DocumentCard
                  key={doc.DOCUMENT_ID}
                  doc={doc}
                  onDelete={handleDelete}
                  accent={ACCENT}
                  ink={INK}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            handleUpload(e.target.files[0]);
          }
        }}
        className="hidden"
      />
    </div>
  );
}

// ── Document Card Component ───────────────────────────────────────────────────

function DocumentCard({
  doc,
  onDelete,
  accent,
  ink,
}: {
  doc: DocumentRow;
  onDelete: (id: string) => void;
  accent: string;
  ink: string;
}) {
  const uploadedDate = new Date(doc.UPLOADED_AT).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: doc.UPLOADED_AT.includes(new Date().getFullYear().toString()) ? undefined : "numeric",
  });

  const fileIcon = {
    pdf: "📄",
    docx: "📝",
    pptx: "📊",
  }[doc.FILE_TYPE.toLowerCase()] || "📎";

  const statusLabel = {
    pending: "Processing...",
    extracted: "Extracted",
    indexed: "Ready",
    failed: "Error",
  }[doc.STATUS] || doc.STATUS;

  const statusColor = {
    pending: "#F59E0B",
    extracted: "#3B82F6",
    indexed: "#10B981",
    failed: "#EF4444",
  }[doc.STATUS] || "#6B7280";

  return (
    <div
      className="p-3 rounded-lg hover:shadow-sm transition-shadow cursor-default group"
      style={{
        border: `1px solid ${ink}15`,
        background: "#fff",
        position: "relative",
      }}
    >
      <div className="flex items-start gap-3">
        <div style={{ fontSize: "18px", marginTop: "2px" }}>{fileIcon}</div>

        <div className="flex-1 min-w-0">
          <p
            style={{
              color: ink,
              fontWeight: 600,
              fontSize: "13px",
              marginBottom: "4px",
              wordBreak: "break-word",
            }}
          >
            {doc.FILE_NAME}
          </p>

          <div
            style={{
              display: "flex",
              gap: "8px",
              fontSize: "11px",
              color: `${ink}70`,
            }}
          >
            <span>{formatFileSize(doc.FILE_SIZE_BYTES)}</span>
            <span>•</span>
            <span>{uploadedDate}</span>
            <span>•</span>
            <span
              style={{
                color: statusColor,
                fontWeight: 600,
              }}
            >
              {statusLabel}
            </span>
          </div>

          {doc.PARSING_METHOD && (
            <p style={{ fontSize: "10px", color: `${ink}55`, marginTop: "4px" }}>
              Parsed via {doc.PARSING_METHOD === "pdfmupdf" ? "PyMuPDF" : "Claude Vision"}
            </p>
          )}
        </div>

        {doc.STATUS === "indexed" && (
          <button
            onClick={() => onDelete(doc.DOCUMENT_ID)}
            className="p-1.5 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
            title="Delete document"
          >
            <Trash2 size={14} color="#EF4444" />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

"use client";

import { useState, useEffect, useRef } from "react";
import { Upload, RefreshCw, Loader2, Trash2, FileText, Search, X, ChevronDown } from "lucide-react";

const INK    = "#1A3358";
const ACCENT = "#E26B2C";
const BG     = "#F5F5F5";
const BLUE   = "#2E7BA1";

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
  NARRATIVE?: string;
  THERAPY_AREA?: string;
  INDICATION?: string;
  BRAND?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Custom confirm dialog ─────────────────────────────────────────────────────

function DeleteConfirmDialog({
  fileName,
  onConfirm,
  onCancel,
}: {
  fileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="rounded-2xl p-7 flex flex-col gap-4"
        style={{ background: "#fff", minWidth: 340, maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: INK, marginBottom: 8 }}>Delete document?</p>
          <p style={{ fontSize: 14, color: `${INK}99`, lineHeight: 1.55 }}>
            This will permanently remove the document and all associated data. This action cannot be undone.
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-full text-sm font-semibold transition-colors hover:bg-black/5"
            style={{ border: `1px solid ${INK}25`, color: INK }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 rounded-full text-sm font-semibold transition-colors hover:opacity-90"
            style={{ background: "#C0392B", color: "#fff" }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function FilterPill({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const active = selected.length > 0;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
        style={{
          border: `1px solid ${active ? INK + "50" : INK + "20"}`,
          background: active ? `${INK}0C` : "rgba(255,255,255,0.7)",
          color: INK,
          fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
          whiteSpace: "nowrap",
        }}
      >
        {label}{active ? ` (${selected.length})` : ""}
        <ChevronDown size={10} style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div
          className="absolute left-0 z-50 mt-1 rounded-xl overflow-hidden"
          style={{ minWidth: 200, background: "#fff", border: `1px solid ${INK}15`, boxShadow: `0 8px 24px ${INK}18`, top: "100%" }}
        >
          {options.length === 0 && (
            <p className="px-4 py-3 text-xs" style={{ color: `${INK}60` }}>No options</p>
          )}
          {options.map((opt, i) => (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-black/5"
              style={{
                borderBottom: i < options.length - 1 ? `1px solid ${INK}08` : "none",
                fontSize: 13,
                color: selected.includes(opt) ? ACCENT : INK,
                fontWeight: selected.includes(opt) ? 700 : 400,
              }}
            >
              <span style={{ width: 14, flexShrink: 0, color: ACCENT }}>{selected.includes(opt) ? "✓" : ""}</span>
              {opt}
            </button>
          ))}
          {active && (
            <button
              onClick={() => { onClear(); setOpen(false); }}
              className="w-full text-left px-4 py-2 hover:bg-black/5"
              style={{ fontSize: 12, color: `${INK}60`, borderTop: `1px solid ${INK}10` }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sort pill ─────────────────────────────────────────────────────────────────

function SortPill({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const options = [["newest", "Newest first"], ["oldest", "Oldest first"], ["name", "By name"]];
  const label = options.find(([v]) => v === value)?.[1] ?? "Sort";
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ border: `1px solid ${INK}20`, background: "rgba(255,255,255,0.7)", color: INK, whiteSpace: "nowrap", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}
      >
        Sort: {label}
        <ChevronDown size={10} style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 rounded-xl overflow-hidden"
          style={{ minWidth: 160, background: "#fff", border: `1px solid ${INK}15`, boxShadow: `0 8px 24px ${INK}18`, top: "100%" }}>
          {options.map(([val, lbl], i) => (
            <button key={val} onClick={() => { onChange(val); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 hover:bg-black/5"
              style={{ borderBottom: i < 2 ? `1px solid ${INK}08` : "none", fontSize: 13, color: val === value ? ACCENT : INK, fontWeight: val === value ? 700 : 400 }}>
              {lbl}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { userId?: string }

export default function ReportsPanel({ userId = "current-user" }: Props) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [filterTherapy, setFilterTherapy] = useState<string[]>([]);
  const [filterIndication, setFilterIndication] = useState<string[]>([]);
  const [filterBrand, setFilterBrand] = useState<string[]>([]);
  const [filterUploadedBy, setFilterUploadedBy] = useState<string[]>([]);
  const [filterDays, setFilterDays] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<DocumentRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── API ──────────────────────────────────────────────────────────────────────

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/documents/list", { headers: { "x-user-id": userId } });
      if (!res.ok) throw new Error(`Failed to fetch: ${res.statusText}`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "docx", "pptx"].includes(ext || "")) { setError("Only PDF, DOCX, and PPTX files are supported"); return; }
    if (file.size > 50 * 1024 * 1024) { setError("File size exceeds 50MB limit"); return; }
    setUploading(true); setError(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", headers: { "x-user-id": userId }, body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Upload failed"); }
      await fetchDocuments();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) { setError(err instanceof Error ? err.message : "Upload failed"); }
    finally { setUploading(false); }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    const docId = deleteTarget.DOCUMENT_ID;
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE", headers: { "x-user-id": userId } });
      if (!res.ok) throw new Error("Failed to delete document");
      await fetchDocuments();
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
  };

  useEffect(() => { fetchDocuments(); }, [userId]);

  // ── Filter / sort ─────────────────────────────────────────────────────────────

  const therapyOptions  = unique(documents.map(d => d.THERAPY_AREA  || "").filter(Boolean));
  const indicOptions    = unique(documents.map(d => d.INDICATION     || "").filter(Boolean));
  const brandOptions    = unique(documents.map(d => d.BRAND          || "").filter(Boolean));
  const uploaderOptions = unique(documents.map(d => d.UPLOAD_USER_ID || "").filter(Boolean));
  const cutoff = filterDays > 0 ? Date.now() - filterDays * 86400000 : 0;

  const filtered = documents.filter(doc => {
    if (!doc.FILE_NAME.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterTherapy.length    > 0 && !filterTherapy.includes(doc.THERAPY_AREA  || "")) return false;
    if (filterIndication.length > 0 && !filterIndication.includes(doc.INDICATION  || "")) return false;
    if (filterBrand.length      > 0 && !filterBrand.includes(doc.BRAND            || "")) return false;
    if (filterUploadedBy.length > 0 && !filterUploadedBy.includes(doc.UPLOAD_USER_ID))   return false;
    if (cutoff > 0 && new Date(doc.UPLOADED_AT).getTime() < cutoff) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "newest") return new Date(b.UPLOADED_AT).getTime() - new Date(a.UPLOADED_AT).getTime();
    if (sortBy === "oldest") return new Date(a.UPLOADED_AT).getTime() - new Date(b.UPLOADED_AT).getTime();
    return a.FILE_NAME.localeCompare(b.FILE_NAME);
  });

  const anyFilter = filterTherapy.length > 0 || filterIndication.length > 0 || filterBrand.length > 0 || filterUploadedBy.length > 0 || filterDays > 0 || searchQuery;

  const toggle = (setter: React.Dispatch<React.SetStateAction<string[]>>, val: string) =>
    setter(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);

  const clearAll = () => {
    setFilterTherapy([]); setFilterIndication([]); setFilterBrand([]);
    setFilterUploadedBy([]); setFilterDays(0); setSearchQuery("");
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: BG }}>

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteConfirmDialog
          fileName={deleteTarget.FILE_NAME}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Masthead */}
      <div className="px-6 pt-4 shrink-0">
        <div style={{ borderTop: `3px double ${INK}`, paddingTop: "5px" }}>
          <div style={{ borderTop: `1px solid ${INK}`, paddingTop: "4px", paddingBottom: "4px", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "12px", fontWeight: 800, letterSpacing: "0.38em", textTransform: "uppercase", color: INK }}>
              Document Repository
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${INK}` }} />
        </div>
      </div>

      {/* Filter / toolbar row — white bg contained within px-6 content boundary */}
      <div className="px-6 shrink-0">
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ flexWrap: "wrap", background: "#fff", borderBottom: `1px solid rgba(26,51,88,0.10)` }}>

        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full"
          style={{ border: `1px solid ${INK}20`, background: "rgba(255,255,255,0.7)", minWidth: 190 }}>
          <Search size={13} style={{ color: `${INK}55`, flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search documents…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, border: "none", background: "transparent", color: INK, fontSize: "12px", outline: "none", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}
          />
          {searchQuery
            ? <button onClick={() => setSearchQuery("")}><X size={11} style={{ color: `${INK}55` }} /></button>
            : <span style={{ fontSize: 10, color: `${INK}35`, fontFamily: "monospace", whiteSpace: "nowrap" }}>⌘K</span>
          }
        </div>

        {/* Multi-select filter pills */}
        <FilterPill label="Therapy Area" options={therapyOptions} selected={filterTherapy}
          onToggle={v => toggle(setFilterTherapy, v)} onClear={() => setFilterTherapy([])} />
        <FilterPill label="Indication" options={indicOptions} selected={filterIndication}
          onToggle={v => toggle(setFilterIndication, v)} onClear={() => setFilterIndication([])} />
        <FilterPill label="Brand" options={brandOptions} selected={filterBrand}
          onToggle={v => toggle(setFilterBrand, v)} onClear={() => setFilterBrand([])} />
        <FilterPill label="Uploaded By" options={uploaderOptions} selected={filterUploadedBy}
          onToggle={v => toggle(setFilterUploadedBy, v)} onClear={() => setFilterUploadedBy([])} />

        {/* Date range */}
        <div style={{ position: "relative" }}>
          <select
            value={filterDays}
            onChange={e => setFilterDays(Number(e.target.value))}
            className="appearance-none px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              border: `1px solid ${filterDays > 0 ? INK + "50" : INK + "20"}`,
              background: filterDays > 0 ? `${INK}0C` : "rgba(255,255,255,0.7)",
              color: INK, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
              paddingRight: 22, cursor: "pointer",
            }}
          >
            <option value={0}>Any date</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <ChevronDown size={10} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: INK }} />
        </div>

        {/* Sort */}
        <SortPill value={sortBy} onChange={setSortBy} />

        {/* Clear all */}
        {anyFilter && (
          <button onClick={clearAll} className="text-xs px-2 py-1 rounded-full hover:bg-black/5"
            style={{ color: `${INK}60`, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>
            Clear all
          </button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        <button
          onClick={() => fetchDocuments()}
          disabled={loading}
          title="Refresh"
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors hover:opacity-85"
          style={{ background: BLUE }}
        >
          <RefreshCw size={14} color="#fff" className={loading ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Upload document"
          className="flex items-center justify-center w-8 h-8 rounded-full shrink-0 transition-colors hover:opacity-85"
          style={{ background: ACCENT }}
        >
          {uploading ? <Loader2 size={14} color="#fff" className="animate-spin" /> : <Upload size={14} color="#fff" />}
        </button>
      </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mb-2 p-3 rounded-lg flex items-center justify-between shrink-0"
          style={{ background: "#FEE2E2", border: "1px solid #FCA5A5" }}>
          <span style={{ color: "#B91C1C", fontSize: "13px" }}>{error}</span>
          <button onClick={() => setError(null)} className="p-1 hover:bg-white/50 rounded"><X size={14} color="#B91C1C" /></button>
        </div>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-y-auto px-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <FileText size={40} style={{ color: `${INK}30`, marginBottom: 12 }} />
            <p style={{ color: INK, fontWeight: 600, marginBottom: 4 }}>
              {anyFilter ? "No documents match your filters" : "No documents yet"}
            </p>
            <p style={{ color: `${INK}55`, fontSize: 13 }}>
              {anyFilter ? "Try adjusting your filters" : "Upload a PDF, DOCX, or PPTX to get started"}
            </p>
          </div>
        ) : (
          <div>
            {sorted.map((doc, i) => (
              <DocumentCard
                key={doc.DOCUMENT_ID}
                doc={doc}
                isLast={i === sorted.length - 1}
                onDelete={() => setDeleteTarget(doc)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
        className="hidden"
      />
    </div>
  );
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocumentCard({
  doc,
  isLast,
  onDelete,
}: {
  doc: DocumentRow;
  isLast: boolean;
  onDelete: () => void;
}) {
  const eyebrow = [doc.THERAPY_AREA, doc.INDICATION, doc.BRAND].filter(Boolean) as string[];
  const fileExt = doc.FILE_TYPE?.toUpperCase() || doc.FILE_NAME.split(".").pop()?.toUpperCase() || "";

  const statusLabel: Record<string, string> = { pending: "PROCESSING", extracted: "EXTRACTED", indexed: "READY", failed: "ERROR" };
  const statusColor: Record<string, string> = { pending: "#F59E0B", extracted: "#3B82F6", indexed: "#10B981", failed: "#EF4444" };

  const summary = doc.NARRATIVE?.trim() || null;

  return (
    <div
      className="group py-4 flex items-start gap-3"
      style={{ borderBottom: isLast ? "none" : `1px solid ${INK}18` }}
    >
      <div className="flex-1 min-w-0">

        {/* Eyebrow — therapy · indication · brand */}
        {eyebrow.length > 0 && (
          <div className="flex items-center flex-wrap mb-1" style={{ gap: "0 6px" }}>
            {eyebrow.map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span style={{ color: ACCENT, fontWeight: 700, fontSize: 14, lineHeight: 1 }}>·</span>}
                <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>
                  {item}
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Filename */}
        <p style={{ color: INK, fontWeight: 700, fontSize: 14, wordBreak: "break-word", lineHeight: 1.35, marginBottom: 4 }}>
          {doc.FILE_NAME}
        </p>

        {/* Summary or placeholder */}
        <p style={{ fontSize: 12, color: `${INK}55`, fontStyle: summary ? "normal" : "italic", marginBottom: 6, lineHeight: 1.4 }}>
          {summary ?? "No summary available"}
        </p>

        {/* Metadata row */}
        <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: `${INK}65` }}>
          <span>{formatFileSize(doc.FILE_SIZE_BYTES)}</span>
          <span>·</span>
          <span>{fileExt}</span>
          <span>·</span>
          <span>{doc.UPLOAD_USER_ID}</span>
          <span>·</span>
          <span>{fmtDate(doc.UPLOADED_AT)}</span>
          <span>·</span>
          <span style={{ color: statusColor[doc.STATUS] ?? "#6B7280", fontWeight: 700, fontSize: 11 }}>
            {statusLabel[doc.STATUS] ?? doc.STATUS.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Delete button — shows on row hover */}
      <button
        onClick={onDelete}
        className="p-1.5 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 shrink-0 mt-1"
        title="Delete document"
      >
        <Trash2 size={15} color="#EF4444" />
      </button>
    </div>
  );
}

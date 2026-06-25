"use client";

import { useState } from "react";
import { X, Trash2, Loader2 } from "lucide-react";

interface Props {
  sourceId:   string;
  sourceName: string;
  userId?:    string;
  onClose:    () => void;
  onDeleted:  () => void;
}

const DELETE_REASONS = [
  { value: "inactive_defunct", label: "Source is inactive or defunct"   },
  { value: "duplicate_source", label: "Duplicate of another source"     },
  { value: "not_relevant",     label: "Not relevant to our use case"    },
  { value: "quality_issues",   label: "Poor content quality"            },
  { value: "other",            label: "Other"                           },
];

export default function DeleteSourceModal({
  sourceId, sourceName, userId, onClose, onDeleted,
}: Props) {
  const [reason,      setReason]      = useState("");
  const [reasonText,  setReasonText]  = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  const handleDelete = async () => {
    if (!reason) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/news/sources/${sourceId}`, {
        method:  "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(userId ? { "x-user-id": userId } : {}),
        },
        body: JSON.stringify({
          reason,
          reasonText: reason === "other" ? reasonText : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to remove source");
        return;
      }
      onDeleted();
      onClose();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-xl shadow-2xl flex flex-col overflow-hidden"
          style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2">
              <Trash2 size={14} style={{ color: "var(--danger)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Remove Source
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-black/5 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 flex flex-col gap-4">
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Remove{" "}
              <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                {sourceName}
              </span>
              ? This will stop future scraping. Existing articles will be retained.
            </p>

            {/* Reason */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Reason <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm focus:outline-none"
                style={{
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  color: reason ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                <option value="">Select a reason…</option>
                {DELETE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {/* Free text for "Other" */}
            {reason === "other" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Details
                </label>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={2}
                  placeholder="Please describe the reason…"
                  className="w-full rounded-lg px-3 py-2 text-sm resize-none focus:outline-none"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>
            )}

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "rgba(220,38,38,0.08)", color: "var(--danger)" }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 flex items-center justify-end gap-2"
            style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-medium transition-colors hover:bg-black/5"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={!reason || submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--danger)" }}
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {submitting ? "Removing…" : "Remove Source"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

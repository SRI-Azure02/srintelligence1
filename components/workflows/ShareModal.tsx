"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { X, Search, UserCheck, Share2, Check } from "lucide-react";

// ── Mock user roster (swap for a real /api/users endpoint when available) ─────
interface MockUser { id: string; name: string; username: string; role: string; }
const MOCK_USERS: MockUser[] = [
  { id: "u1", name: "Alice Johnson",  username: "alice.johnson",  role: "Analyst" },
  { id: "u2", name: "Bob Martinez",   username: "bob.martinez",   role: "Data Scientist" },
  { id: "u3", name: "Carol Singh",    username: "carol.singh",    role: "Manager" },
  { id: "u4", name: "David Chen",     username: "david.chen",     role: "Analyst" },
  { id: "u5", name: "Emma Williams",  username: "emma.williams",  role: "Engineer" },
  { id: "u6", name: "Frank Okafor",   username: "frank.okafor",   role: "Director" },
  { id: "u7", name: "Grace Kim",      username: "grace.kim",      role: "Analyst" },
  { id: "u8", name: "Henry Patel",    username: "henry.patel",    role: "Data Scientist" },
];

type SharePermission = "view" | "edit";

export default function ShareModal({
  workflowId,
  workflowName,
  onClose,
}: {
  workflowId: string;
  workflowName: string;
  onClose: () => void;
}) {
  const [query,      setQuery]      = useState("");
  const [selected,   setSelected]   = useState<MockUser | null>(null);
  const [permission, setPermission] = useState<SharePermission>("view");
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = query.trim()
    ? MOCK_USERS.filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) ||
          u.username.toLowerCase().includes(query.toLowerCase()),
      )
    : MOCK_USERS;

  const handleSelect = (u: MockUser) => {
    setSelected(u);
    setQuery(u.name);
    setError(null);
  };

  const handleSend = useCallback(async () => {
    if (!selected) { setError("Please select a user."); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-id": "current-user" },
        body: JSON.stringify({ sharedWithUserId: selected.id, permission }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSent(true);
      setTimeout(onClose, 1400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share.");
    } finally {
      setSending(false);
    }
  }, [selected, permission, workflowId, onClose]);

  const showDropdown = query.trim().length > 0 && !selected;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 400, background: "#ffffff", border: "1px solid var(--border)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Share Workflow</p>
            <p className="text-xs mt-0.5 truncate max-w-[300px]" style={{ color: "var(--text-muted)" }}>
              {workflowName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          {/* User search */}
          <div className="relative">
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Share with
            </label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-muted)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null); setError(null); }}
                placeholder="Search by name or username…"
                className="w-full text-xs rounded-lg pl-8 pr-3 py-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
              />
            </div>
            {showDropdown && (
              <div className="absolute left-0 right-0 z-10 rounded-lg overflow-hidden mt-1 shadow-lg"
                style={{ background: "#ffffff", border: "1px solid var(--border)", maxHeight: 200, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <p className="text-xs px-3 py-2.5" style={{ color: "var(--text-muted)" }}>No users found</p>
                ) : (
                  filtered.map((u) => (
                    <button key={u.id} onClick={() => handleSelect(u)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/4">
                      <span className="flex items-center justify-center rounded-full shrink-0 text-xs font-semibold"
                        style={{ width: 28, height: 28, background: "rgba(40,145,218,0.12)", color: "#2891DA" }}>
                        {u.name[0]}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{u.name}</span>
                        <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>@{u.username} · {u.role}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected chip */}
          {selected && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
              style={{ background: "rgba(40,145,218,0.07)", border: "1px solid rgba(40,145,218,0.2)" }}>
              <UserCheck size={13} style={{ color: "#2891DA", flexShrink: 0 }} />
              <span className="text-xs font-medium flex-1" style={{ color: "#2891DA" }}>
                {selected.name}
                <span className="font-normal ml-1" style={{ color: "var(--text-muted)" }}>@{selected.username}</span>
              </span>
              <button onClick={() => { setSelected(null); setQuery(""); }}
                className="p-0.5 rounded hover:bg-black/8 transition-colors" style={{ color: "var(--text-muted)" }}>
                <X size={11} />
              </button>
            </div>
          )}

          {/* Permission */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Permission</label>
            <div className="flex gap-2">
              {(["view", "edit"] as SharePermission[]).map((p) => (
                <button key={p} onClick={() => setPermission(p)}
                  className="flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors"
                  style={permission === p
                    ? { background: "#2891DA", color: "#fff", border: "1px solid #2891DA" }
                    : { background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                  {p === "view" ? "View only" : "Can edit"}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
          style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
            style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
            Cancel
          </button>
          <button onClick={handleSend} disabled={sending || sent || !selected}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: sent ? "#22c55e" : "#2891DA", color: "#fff",
              opacity: (!selected || sending) ? 0.6 : 1,
              cursor: (!selected || sending) ? "default" : "pointer",
            }}>
            {sent ? (
              <><Check size={12} /> Shared!</>
            ) : sending ? (
              <><span className="animate-spin" style={{ display: "block", width: 12, height: 12, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} /> Sharing…</>
            ) : (
              <><Share2 size={12} /> Share</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

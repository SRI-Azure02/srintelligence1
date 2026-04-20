"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Save, Play, Trash2, Pencil, Check,
  StickyNote, ChevronDown, FastForward, Bookmark, Trash,
} from "lucide-react";
import WorkflowCanvas, { edgeDefaults } from "@/components/workflows/WorkflowCanvas";
import { loadSavedWorkflows, saveWorkflow } from "@/lib/workflow-storage";
import { loadVersions, appendVersion, deleteVersion, toggleBookmark } from "@/lib/workflow-versions";
import type { WorkflowVersion } from "@/lib/workflow-versions";
import type { AgentStep } from "@/lib/types";
import { Node, Edge } from "@xyflow/react";

// ── Types ────────────────────────────────────────────────────────────────────
type ScheduleType = "daily" | "weekly" | "monthly";
const DAYS    = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS   = Array.from({ length: 12 }, (_, i) => String(i === 0 ? 12 : i));
const MINUTES = ["00", "15", "30", "45"];

// ── VerticalUpdateToggle ──────────────────────────────────────────────────────
// Knob at top  = Auto-Update (enabled)   — label sits top-left of pill
// Knob at bottom = Manual-Update (disabled) — label sits bottom-left of pill
// Schedule picker appears below the Auto-Update label when enabled.
function VerticalUpdateToggle({ enabled, onChange }: {
  enabled: boolean; onChange: (v: boolean) => void;
}) {
  const TRACK_H = 42;   // slightly taller than before
  const KNOB    = 12;
  const PAD     = 2;
  const travel  = TRACK_H - PAD * 2 - KNOB;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      {/* LEFT — label + (if auto) schedule picker, aligned to knob position */}
      <div
        style={{
          display:        "flex",
          flexDirection:  "column",
          height:         TRACK_H,             // matches pill height
          justifyContent: enabled ? "flex-start" : "flex-end",
          alignItems:     "flex-end",          // flush against the pill
          gap:            4,
        }}
      >
        <span
          className="text-xs font-semibold"
          style={{ color: "var(--text-primary)", lineHeight: 1.2, whiteSpace: "nowrap" }}
        >
          {enabled ? "Auto-Update" : "Manual-Update"}
        </span>
        {enabled && <InlineSchedulePicker />}
      </div>

      {/* RIGHT — vertical pill */}
      <button
        onClick={() => onChange(!enabled)}
        title={enabled ? "Switch to Manual-Update" : "Switch to Auto-Update"}
        className="relative shrink-0 rounded-full transition-colors"
        style={{
          width:      18,
          height:     TRACK_H,
          background: enabled ? "#2891DA" : "var(--bg-hover)",
          border:     "1px solid var(--border)",
        }}
      >
        <span
          className="absolute rounded-full bg-white shadow transition-transform"
          style={{
            width:     KNOB,
            height:    KNOB,
            left:      PAD,
            top:       PAD,
            transform: enabled ? "translateY(0px)" : `translateY(${travel}px)`,
          }}
        />
      </button>
    </div>
  );
}

// ── InlineSchedulePicker ─────────────────────────────────────────────────────
function InlineSchedulePicker() {
  const [schedule, setSchedule] = useState<ScheduleType>("daily");
  const [hour,      setHour]      = useState("9");
  const [minute,    setMinute]    = useState("00");
  const [ampm,      setAmpm]      = useState<"AM" | "PM">("AM");
  const [day,       setDay]       = useState("Mon");
  const [monthDate, setMonthDate] = useState("1");
  const [open,      setOpen]      = useState(false);

  const label =
    schedule === "daily"   ? `Daily · ${hour}:${minute} ${ampm}` :
    schedule === "weekly"  ? `Weekly · ${day} ${hour}:${minute} ${ampm}` :
                             `Monthly · ${monthDate} · ${hour}:${minute} ${ampm}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors hover:bg-black/5"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
      >
        <span style={{ color: "var(--text-muted)" }}>Schedule:</span>
        <span className="font-medium">{label}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 rounded-xl shadow-xl p-3 flex flex-col gap-2"
          style={{ background: "#ffffff", border: "1px solid var(--border)", minWidth: 260 }}>
          <div className="flex gap-1.5">
            {(["daily", "weekly", "monthly"] as ScheduleType[]).map((s) => (
              <button key={s} onClick={() => setSchedule(s)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium capitalize transition-colors"
                style={{ background: schedule === s ? "#2891DA" : "var(--bg-secondary)", color: schedule === s ? "white" : "var(--text-secondary)" }}>
                {s}
              </button>
            ))}
          </div>
          {schedule === "weekly" && (
            <div className="flex gap-1 flex-wrap">
              {DAYS.map((d) => (
                <button key={d} onClick={() => setDay(d)} className="px-2 py-1 rounded text-xs transition-colors"
                  style={{ background: day === d ? "#2891DA" : "var(--bg-secondary)", color: day === d ? "white" : "var(--text-muted)", border: `1px solid ${day === d ? "#2891DA" : "var(--border)"}` }}>
                  {d}
                </button>
              ))}
            </div>
          )}
          {schedule === "monthly" && (
            <div className="flex gap-1 flex-wrap max-h-20 overflow-y-auto">
              {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                <button key={d} onClick={() => setMonthDate(d)}
                  className="w-6 h-6 rounded text-xs transition-colors flex items-center justify-center"
                  style={{ background: monthDate === d ? "#2891DA" : "var(--bg-secondary)", color: monthDate === d ? "white" : "var(--text-muted)", border: `1px solid ${monthDate === d ? "#2891DA" : "var(--border)"}` }}>
                  {d}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Time:</span>
            <select value={hour} onChange={(e) => setHour(e.target.value)} className="rounded px-1.5 py-0.5 text-xs outline-none"
              style={{ border: "1px solid var(--border)", background: "#fff", color: "var(--text-primary)" }}>
              {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>:</span>
            <select value={minute} onChange={(e) => setMinute(e.target.value)} className="rounded px-1.5 py-0.5 text-xs outline-none"
              style={{ border: "1px solid var(--border)", background: "#fff", color: "var(--text-primary)" }}>
              {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="flex rounded overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              {(["AM", "PM"] as const).map((p) => (
                <button key={p} onClick={() => setAmpm(p)} className="px-2 py-0.5 text-xs transition-colors"
                  style={{ background: ampm === p ? "#2891DA" : "#fff", color: ampm === p ? "white" : "var(--text-muted)" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <button onClick={() => setOpen(false)}
            className="text-xs font-medium self-end px-2 py-1 rounded transition-colors hover:bg-black/5"
            style={{ color: "var(--accent)" }}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ── Build ReactFlow nodes + edges from an AgentStep chain ────────────────────
function buildCanvas(chain: AgentStep[]): { nodes: Node[]; edges: Edge[] } {
  const SPACING_X = 260;
  const START_X   = 100;
  const NODE_Y    = 200;

  const nodes: Node[] = chain.map((step, idx) => ({
    id: step.id,
    type: "agentNode" as const,
    position: step.position ?? { x: START_X + idx * SPACING_X, y: NODE_Y },
    data: {
      agentType:     step.type,
      label:         step.label,
      prompt:        step.prompt ?? step.label,
      stepNumber:    idx + 1,
      runPerSegment: step.runPerSegment ?? false,
    },
  }));
  nodes.push({
    id:       "output",
    type:     "outputNode" as const,
    position: { x: START_X + chain.length * SPACING_X, y: NODE_Y },
    data:     {},
  });

  const edges: Edge[] = chain.map((step, idx) => {
    const targetId = idx < chain.length - 1 ? chain[idx + 1].id : "output";
    return { id: `e-${step.id}-${targetId}`, source: step.id, target: targetId, ...edgeDefaults };
  });

  return { nodes, edges };
}

// ── Compact version scrubber — canvas overlay ────────────────────────────────
function CompactVersionBar({
  versions,
  selectedIdx,
  onSelect,
  onRestore,
  onDelete,
  onBookmark,
  workflowId,
}: {
  versions:    WorkflowVersion[];
  selectedIdx: number;
  onSelect:    (idx: number) => void;
  onRestore:   () => void;
  onDelete:    (versionId: string) => void;
  onBookmark:  (versionId: string) => void;
  workflowId:  string | undefined;
}) {
  const [hoveredDotIdx, setHoveredDotIdx] = useState<number | null>(null);
  // Delay hiding so the cursor can travel the gap between dot and popup
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showDot  = (i: number) => { if (hideTimer.current) clearTimeout(hideTimer.current); setHoveredDotIdx(i); };
  const delayHide = () => { hideTimer.current = setTimeout(() => setHoveredDotIdx(null), 160); };
  const cancelHide = () => { if (hideTimer.current) clearTimeout(hideTimer.current); };

  const hasVersions = versions.length > 0;
  const isLatest    = !hasVersions || selectedIdx === versions.length - 1;
  const selected    = versions[selectedIdx];
  const fmtTs = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });

  return (
    <div
      style={{
        position:     "absolute",
        top:          12,   // same row as the Undo/Redo toolbar
        left:         12,
        zIndex:       10,
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        background:   "#ffffff",
        border:       "1px solid var(--border)",
        borderRadius: 8,
        padding:      "4px 12px",
        boxShadow:    "none",
        width:        360,
        overflow:     "visible",
        height:       30,
      }}
    >
      {/* "History" label */}
      <span style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)", flexShrink: 0 }}>
        History
      </span>

      {/* Track */}
      <div style={{ flex: 1, position: "relative", height: 28, display: "flex", alignItems: "center", overflow: "visible" }}>
        {/* Rail */}
        <div
          style={{
            position: "absolute", left: 0, right: 0,
            height: 2, top: "50%", transform: "translateY(-50%)",
            background: "var(--border)", borderRadius: 2,
          }}
        />

        {hasVersions ? (
          <>
            {/* Invisible range input for smooth drag */}
            <input
              type="range"
              min={0}
              max={Math.max(1, versions.length - 1)}
              value={selectedIdx}
              onChange={(e) => onSelect(Number(e.target.value))}
              style={{ position: "absolute", inset: 0, width: "100%", opacity: 0, cursor: "pointer", zIndex: 2 }}
            />

            {/* Version dots — sit above range input so hover is detectable */}
            {versions.map((v, i) => {
              const pct       = versions.length === 1 ? 50 : (i / (versions.length - 1)) * 100;
              const isSel     = i === selectedIdx;
              const isHovered = hoveredDotIdx === i;

              return (
                <div
                  key={v.versionId}
                  onMouseEnter={() => showDot(i)}
                  onMouseLeave={delayHide}
                  onClick={() => onSelect(i)}
                  title={`v${v.versionNumber} · ${fmtTs(v.savedAt)}${v.bookmarked ? " 🔖" : ""}${v.notes ? `\n"${v.notes}"` : ""}`}
                  style={{
                    position:     "absolute",
                    left:         `${pct}%`,
                    top:          "50%",
                    transform:    "translate(-50%, -50%)",
                    width:        isSel ? 12 : 9,
                    height:       isSel ? 12 : 9,
                    borderRadius: "50%",
                    background:   isSel ? "#2891DA" : v.bookmarked ? "rgba(40,145,218,0.15)" : "#ffffff",
                    border:       isSel ? "none" : v.bookmarked ? "1.5px solid #2891DA" : "1.5px solid var(--border)",
                    boxShadow:    "none",
                    transition:   "all 0.15s",
                    cursor:       "pointer",
                    zIndex:       isHovered ? 25 : 3,   // raise above the date label (z:4) when popup is open
                  }}
                >
                  {/* Hover action popup — appears BELOW the bar card */}
                  {isHovered && workflowId && (
                    <div
                      onMouseEnter={cancelHide}
                      onMouseLeave={delayHide}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position:     "absolute",
                        top:          "calc(100% + 18px)",   // clear the bottom of the bar card
                        left:         "50%",
                        transform:    "translateX(-50%)",
                        display:      "flex",
                        flexDirection:"column",
                        alignItems:   "center",
                        gap:          4,
                        background:   "#ffffff",
                        border:       "1px solid var(--border)",
                        borderRadius: 8,
                        padding:      "6px 8px",
                        boxShadow:    "0 4px 12px rgba(0,0,0,0.12)",
                        zIndex:       20,
                        whiteSpace:   "nowrap",
                      }}
                    >
                      {/* Date/time row */}
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>
                        v{v.versionNumber} · {fmtTs(v.savedAt)}
                      </span>
                      {/* Action buttons row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); onBookmark(v.versionId); }}
                          title={v.bookmarked ? "Remove bookmark" : "Bookmark this version"}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 26, height: 26, borderRadius: 6, border: "none",
                            background: v.bookmarked ? "rgba(40,145,218,0.08)" : "transparent",
                            cursor: "pointer",
                            color: v.bookmarked ? "#2891DA" : "var(--text-muted)",
                          }}
                        >
                          <Bookmark size={13} fill={v.bookmarked ? "#2891DA" : "none"} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(v.versionId); }}
                          title="Delete this version"
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: 26, height: 26, borderRadius: 6, border: "none",
                            background: "transparent", cursor: "pointer",
                            color: "#DC2626",
                          }}
                        >
                          <Trash size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Persistent date/time label below bar — centred on the selected dot */}
            {versions[selectedIdx] && (
              <div
                style={{
                  position:      "absolute",
                  left:          `${versions.length === 1 ? 50 : (selectedIdx / (versions.length - 1)) * 100}%`,
                  top:           "calc(100% + 6px)",
                  transform:     "translateX(-50%)",
                  pointerEvents: "none",
                  zIndex:        4,
                  whiteSpace:    "nowrap",
                }}
              >
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {fmtTs(versions[selectedIdx].savedAt)}
                </span>
              </div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)", position: "absolute", whiteSpace: "nowrap", left: 0 }}>
            No history yet
          </span>
        )}
      </div>

      {/* Version detail — fixed width so the track never changes length */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0, flexGrow: 0, width: 88, justifyContent: "flex-end", marginLeft: 8 }}>
        {selected ? (
          <>
            {selected.bookmarked && (
              <Bookmark size={11} fill="#2891DA" style={{ color: "#2891DA", flexShrink: 0 }} />
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: isLatest ? "#2891DA" : "#f59e0b" }}>
              v{selected.versionNumber}
            </span>
            {isLatest && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· latest</span>
            )}
            {!isLatest && (
              <button
                onClick={onRestore}
                title="Go to latest"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#f59e0b", background: "transparent", border: "none",
                  borderRadius: 6, padding: "4px 7px", cursor: "pointer",
                }}
              >
                <FastForward size={15} />
              </button>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Save to checkpoint</span>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function WorkflowEditPage() {
  const params     = useParams();
  const workflowId = params?.id as string | undefined;

  // Gate canvas render until client-side data is loaded
  const [loaded, setLoaded] = useState(!workflowId || workflowId === "new");

  // Live canvas state (populated in useEffect)
  const [initialNodes, setInitialNodes] = useState<Node[] | undefined>(undefined);
  const [initialEdges, setInitialEdges] = useState<Edge[] | undefined>(undefined);
  const [workflowName, setWorkflowName] = useState("New Workflow");
  const [createdLabel,  setCreatedLabel]  = useState<string | null>(null);
  const [modifiedLabel, setModifiedLabel] = useState<string | null>(null);
  const [notes,    setNotes]    = useState("");
  const [notesOpen, setNotesOpen] = useState(false);

  // Version history
  const [versions,          setVersions]          = useState<WorkflowVersion[]>([]);
  const [selectedVersionIdx, setSelectedVersionIdx] = useState(0);

  // UI
  const [autoUpdate,   setAutoUpdate]   = useState(false);
  const [isDirty,      setIsDirty]      = useState(false);
  const [editingName,  setEditingName]  = useState(false);
  const [nameHovered,  setNameHovered]  = useState(false);

  const fmtDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;

  // ── Client-side load ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!workflowId || workflowId === "new") { setLoaded(true); return; }

    const wf = loadSavedWorkflows().find((w) => w.id === workflowId);
    if (!wf) { setLoaded(true); return; }

    setWorkflowName(wf.name);
    setCreatedLabel(fmtDate(wf.createdAt));
    setModifiedLabel(fmtDate(wf.updatedAt));
    setNotes(wf.notes ?? "");

    if (wf.agentChain?.length) {
      const { nodes, edges } = buildCanvas(wf.agentChain);
      setInitialNodes(nodes);
      setInitialEdges(edges);
    }

    const vers = loadVersions(workflowId);
    setVersions(vers);
    setSelectedVersionIdx(Math.max(0, vers.length - 1));

    setLoaded(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Version-derived canvas data ───────────────────────────────────────────
  const isViewingPastVersion = versions.length > 0 && selectedVersionIdx < versions.length - 1;
  const canvasVersion        = isViewingPastVersion ? versions[selectedVersionIdx] : null;

  const { nodes: vNodes, edges: vEdges } = canvasVersion
    ? buildCanvas(canvasVersion.agentChain)
    : { nodes: initialNodes ?? [], edges: initialEdges ?? [] };

  // Force canvas remount when switching between versions
  const canvasKey = isViewingPastVersion ? `ver-${selectedVersionIdx}` : "live";

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (!workflowId || workflowId === "new") return;
    const wf = loadSavedWorkflows().find((w) => w.id === workflowId);
    if (!wf) return;

    const updated = { ...wf, name: workflowName, notes };
    saveWorkflow(updated);

    const newVer = appendVersion(workflowId, workflowName, wf.agentChain);
    setVersions((prev) => {
      const next = [...prev, newVer];
      setSelectedVersionIdx(next.length - 1); // jump to latest
      return next;
    });
    setIsDirty(false);
    setModifiedLabel(fmtDate(new Date().toISOString()));
  }, [workflowId, workflowName, notes]);

  // ── Delete a version ────────────────────────────────────────────────────
  const handleDeleteVersion = useCallback((versionId: string) => {
    if (!workflowId) return;
    const updated = deleteVersion(workflowId, versionId);
    setVersions(updated);
    // If deleted version was selected, clamp to the new latest
    setSelectedVersionIdx((prev) => Math.min(prev, Math.max(0, updated.length - 1)));
  }, [workflowId]);

  // ── Bookmark / un-bookmark a version ────────────────────────────────────
  const handleToggleBookmark = useCallback((versionId: string) => {
    if (!workflowId) return;
    const updated = toggleBookmark(workflowId, versionId);
    setVersions(updated);
  }, [workflowId]);

  // ── Restore past version to live ─────────────────────────────────────────
  const handleRestore = useCallback(() => {
    if (!canvasVersion) return;
    const { nodes, edges } = buildCanvas(canvasVersion.agentChain);
    setInitialNodes(nodes);
    setInitialEdges(edges);
    setWorkflowName(canvasVersion.name);
    // Jump to latest slot (the live canvas)
    setSelectedVersionIdx(versions.length - 1);
    setIsDirty(true);
  }, [canvasVersion, versions.length]);


  return (
    <div className="flex flex-col h-full" style={{ background: "#ffffff" }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-5 py-4 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "#ffffff", minHeight: 68 }}
      >
        {/* Workflow name + rename */}
        <div
          className="flex items-center gap-1.5"
          onMouseEnter={() => setNameHovered(true)}
          onMouseLeave={() => setNameHovered(false)}
        >
          {editingName ? (
            <>
              <input
                autoFocus
                value={workflowName}
                onChange={(e) => { setWorkflowName(e.target.value); setIsDirty(true); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditingName(false); }}
                onBlur={() => setEditingName(false)}
                className="bg-transparent text-sm font-semibold outline-none pb-0.5"
                style={{ color: "var(--text-primary)", minWidth: 200, borderBottom: "1px solid rgba(0,0,0,0.2)" }}
              />
              <button onClick={() => setEditingName(false)} className="p-0.5 rounded" style={{ color: "var(--accent)" }}>
                <Check size={12} />
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)", lineHeight: 1.3 }}>
                  {workflowName}
                </span>
                {(createdLabel || modifiedLabel) && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {createdLabel && <>Created {createdLabel}</>}
                    {createdLabel && modifiedLabel && <span style={{ margin: "0 5px", opacity: 0.35 }}>·</span>}
                    {modifiedLabel && <>Modified {modifiedLabel}</>}
                  </span>
                )}
              </div>
              {nameHovered && (
                <button
                  onClick={() => setEditingName(true)}
                  className="p-0.5 rounded hover:bg-black/5 transition-colors self-start mt-0.5"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Pencil size={11} />
                </button>
              )}
            </>
          )}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {/* Auto/Manual update toggle — label left, pill right */}
          <VerticalUpdateToggle enabled={autoUpdate} onChange={setAutoUpdate} />

          {/* Separator */}
          <div style={{ width: 1, height: 28, background: "var(--border)", flexShrink: 0 }} />

          {/* Notes toggle */}
          <button
            onClick={() => setNotesOpen((v) => !v)}
            title="Notes"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-black/5"
            style={{
              color:      notesOpen ? "var(--accent)"    : "var(--text-secondary)",
              border:     `1px solid ${notesOpen ? "var(--accent)" : "var(--border)"}`,
              background: notesOpen ? "rgba(40,145,218,0.06)" : "transparent",
            }}
          >
            <StickyNote size={16} />
            Notes
          </button>

          <Link
            href={`/workflows/${workflowId ?? "new"}/run`}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
            style={{ background: "var(--accent)", color: "white" }}
          >
            <Play size={13} fill="white" />
            Run
          </Link>

          {/* Save — icon only */}
          <button
            onClick={handleSave}
            title="Save"
            className="flex items-center justify-center p-2 rounded-lg transition-colors hover:bg-black/5"
            style={{
              color:  isDirty ? "var(--accent)"  : "var(--text-secondary)",
              border: `1px solid ${isDirty ? "var(--accent)" : "var(--border)"}`,
            }}
          >
            <Save size={16} />
          </button>

          {/* Delete — icon only */}
          <button
            title="Delete workflow"
            className="flex items-center justify-center p-2 rounded-lg transition-colors hover:bg-red-50"
            style={{ color: "var(--danger)", border: "1px solid var(--border)" }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* ── Notes panel — slides down from just below header ───────────── */}
      {notesOpen && (
        <div
          className="shrink-0 flex flex-col"
          style={{ height: 160, borderBottom: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <div
            className="flex items-center justify-between px-4 py-2 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              Workflow Notes
            </span>
            <button
              onClick={() => setNotesOpen(false)}
              className="p-0.5 rounded hover:bg-black/5 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <ChevronDown size={13} />
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setIsDirty(true); }}
            placeholder="Add notes about this workflow — purpose, assumptions, known limitations…"
            className="flex-1 resize-none outline-none px-4 py-3 text-xs"
            style={{
              background: "transparent",
              color:      "var(--text-primary)",
              fontFamily: "inherit",
              lineHeight: 1.6,
            }}
          />
        </div>
      )}

      {/* ── Canvas — position:relative so the overlay card anchors to it ── */}
      <div className="flex-1 overflow-hidden" style={{ position: "relative" }}>
        {loaded && (
          <WorkflowCanvas
            key={canvasKey}
            initialNodes={isViewingPastVersion ? vNodes : initialNodes}
            initialEdges={isViewingPastVersion ? vEdges : initialEdges}
            startEmpty={!isViewingPastVersion && !initialNodes}
            toolbarOffset={396}
          />
        )}
        {/* Compact version scrubber — floats below Undo/Redo/Add Step */}
        <CompactVersionBar
          versions={versions}
          selectedIdx={selectedVersionIdx}
          onSelect={setSelectedVersionIdx}
          onRestore={handleRestore}
          onDelete={handleDeleteVersion}
          onBookmark={handleToggleBookmark}
          workflowId={workflowId}
        />
      </div>
    </div>
  );
}

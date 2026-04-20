"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Pencil,
  Trash2,
  Plus,
  Play,
  X,
  Check,
  GripVertical,
  Undo2,
  Redo2,
  BookOpen,
} from "lucide-react";
import type { Plan, PlanStep, PlanStepStatus } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusIcon(status: PlanStepStatus, isActive: boolean) {
  switch (status) {
    case "done":
      return <CheckCircle2 size={16} style={{ color: "#22c55e", flexShrink: 0 }} />;
    case "error":
      return <AlertCircle size={16} style={{ color: "#ef4444", flexShrink: 0 }} />;
    case "running":
      return (
        <Loader2
          size={16}
          className="animate-spin"
          style={{ color: "var(--accent, #2891DA)", flexShrink: 0 }}
        />
      );
    default:
      return (
        <Circle
          size={16}
          style={{
            color: isActive ? "var(--accent, #2891DA)" : "var(--text-muted, #9ca3af)",
            flexShrink: 0,
          }}
        />
      );
  }
}

function StepBadge({ n, status }: { n: number; status: PlanStepStatus }) {
  const color =
    status === "done"    ? "#22c55e" :
    status === "error"   ? "#ef4444" :
    status === "running" ? "var(--accent, #2891DA)" :
    "var(--text-muted, #9ca3af)";
  return (
    <span
      className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center font-bold text-white"
      style={{ background: color, fontSize: "12px" }}
    >
      {n}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PlanCardProps {
  plan: Plan;
  onPlanChange: (updated: Plan) => void;
  onExecute: (plan: Plan) => void;
  isExecuting: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const MAX_HISTORY = 10;

export default function PlanCard({ plan, onPlanChange, onExecute, isExecuting }: PlanCardProps) {
  // Inline editing state
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editTitle, setEditTitle]   = useState("");
  const [editDesc,  setEditDesc]    = useState("");
  const [editMsg,   setEditMsg]     = useState("");

  // Add-step form
  const [showAdd,    setShowAdd]    = useState(false);
  const [addTitle,   setAddTitle]   = useState("");
  const [addDesc,    setAddDesc]    = useState("");
  const [addMsg,     setAddMsg]     = useState("");
  const addTitleRef = useRef<HTMLInputElement>(null);

  // Undo / redo history stacks (each entry is a snapshot of plan.steps)
  const [undoStack, setUndoStack] = useState<PlanStep[][]>([]);
  const [redoStack, setRedoStack] = useState<PlanStep[][]>([]);

  // Wrapper: push current steps onto undo stack, clear redo, then propagate
  const pushChange = (updated: Plan) => {
    setUndoStack(prev => [...prev.slice(-(MAX_HISTORY - 1)), plan.steps]);
    setRedoStack([]);
    onPlanChange(updated);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r.slice(-(MAX_HISTORY - 1)), plan.steps]);
    setUndoStack(u => u.slice(0, -1));
    onPlanChange({ ...plan, steps: prev });
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u.slice(-(MAX_HISTORY - 1)), plan.steps]);
    setRedoStack(r => r.slice(0, -1));
    onPlanChange({ ...plan, steps: next });
  };

  // Keyboard shortcuts: Ctrl+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === "y" || (e.key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoStack, redoStack, plan.steps]);

  useEffect(() => {
    if (showAdd) addTitleRef.current?.focus();
  }, [showAdd]);

  // ── Editing ────────────────────────────────────────────────────────────────

  const startEdit = (step: PlanStep) => {
    setEditingId(step.id);
    setEditTitle(step.title);
    setEditDesc(step.description);
    setEditMsg(step.message);
  };

  const commitEdit = () => {
    if (!editingId) return;
    pushChange({
      ...plan,
      steps: plan.steps.map((s) =>
        s.id === editingId
          ? { ...s, title: editTitle.trim() || s.title, description: editDesc.trim(), message: editMsg.trim() || editTitle.trim() || s.message }
          : s,
      ),
    });
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteStep = (id: string) => {
    pushChange({ ...plan, steps: plan.steps.filter((s) => s.id !== id) });
  };

  // ── Add step ───────────────────────────────────────────────────────────────

  const commitAdd = () => {
    const title = addTitle.trim();
    if (!title) return;
    const newStep: PlanStep = {
      id:          crypto.randomUUID(),
      title,
      description: addDesc.trim(),
      message:     addMsg.trim() || title,
      status:      "pending",
    };
    pushChange({ ...plan, steps: [...plan.steps, newStep] });
    setAddTitle("");
    setAddDesc("");
    setAddMsg("");
    setShowAdd(false);
  };

  // ── Drag-and-drop reorder ──────────────────────────────────────────────────

  const dragSrcIdx  = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    dragSrcIdx.current = idx;
    e.dataTransfer.effectAllowed = "move";
    // Minimal ghost — just the step number so it doesn't obscure the list
    e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 12, 12);
  };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };

  const handleDrop = (dropIdx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const srcIdx = dragSrcIdx.current;
    if (srcIdx === null || srcIdx === dropIdx) { setDragOverIdx(null); return; }
    const reordered = [...plan.steps];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    pushChange({ ...plan, steps: reordered });
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    dragSrcIdx.current = null;
    setDragOverIdx(null);
  };

  // ── Execute ────────────────────────────────────────────────────────────────

  const canExecute = plan.steps.length > 0 && !isExecuting && !plan.executing;

  // ── Execution progress label ───────────────────────────────────────────────

  const runningStep =
    plan.executing && plan.executingIndex !== null
      ? plan.steps[plan.executingIndex]
      : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        border:     "1px solid var(--border, #e5e7eb)",
        background: "var(--bg-primary, #fff)",
        maxWidth:   "100%",
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-3 gap-3"
        style={{
          background:   "linear-gradient(90deg, rgba(40,145,218,0.08) 0%, rgba(200,149,106,0.06) 100%)",
          borderBottom: "1px solid var(--border, #e5e7eb)",
        }}
      >
        {/* Left: icon + title + step count */}
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen size={14} style={{ color: "var(--accent, #2891DA)", flexShrink: 0 }} strokeWidth={2} />
          <span className="text-xs font-bold uppercase tracking-widest whitespace-nowrap" style={{ color: "var(--text-primary, #111)" }}>
            Analysis Plan
          </span>
          <span
            className="text-xs px-1.5 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: "var(--bg-secondary, #f9fafb)", color: "var(--text-muted, #6b7280)", fontSize: "10px" }}
          >
            {plan.steps.length} step{plan.steps.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Right: undo / redo + execute */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Undo */}
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            title={`Undo (Ctrl+Z) · ${undoStack.length} step${undoStack.length !== 1 ? "s" : ""} in memory`}
            className="relative flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
            style={{
              background: undoStack.length > 0 ? "var(--bg-secondary, #f3f4f6)" : "transparent",
              color:      undoStack.length > 0 ? "var(--text-secondary, #6b7280)" : "var(--text-muted, #d1d5db)",
              border:     "1px solid var(--border, #e5e7eb)",
              cursor:     undoStack.length > 0 ? "pointer" : "not-allowed",
              opacity:    undoStack.length > 0 ? 1 : 0.4,
            }}
          >
            <Undo2 size={11} />
            {undoStack.length > 0 && (
              <span
                className="font-mono font-bold"
                style={{ fontSize: "9px", color: "var(--accent, #2891DA)", minWidth: 8 }}
              >
                {undoStack.length}
              </span>
            )}
          </button>

          {/* Redo */}
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            title={`Redo (Ctrl+Y) · ${redoStack.length} step${redoStack.length !== 1 ? "s" : ""} in memory`}
            className="relative flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
            style={{
              background: redoStack.length > 0 ? "var(--bg-secondary, #f3f4f6)" : "transparent",
              color:      redoStack.length > 0 ? "var(--text-secondary, #6b7280)" : "var(--text-muted, #d1d5db)",
              border:     "1px solid var(--border, #e5e7eb)",
              cursor:     redoStack.length > 0 ? "pointer" : "not-allowed",
              opacity:    redoStack.length > 0 ? 1 : 0.4,
            }}
          >
            <Redo2 size={11} />
            {redoStack.length > 0 && (
              <span
                className="font-mono font-bold"
                style={{ fontSize: "9px", color: "var(--accent, #2891DA)", minWidth: 8 }}
              >
                {redoStack.length}
              </span>
            )}
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: "var(--border, #e5e7eb)", margin: "0 2px" }} />

          {/* Execute button */}
          <button
            onClick={() => canExecute && onExecute(plan)}
            disabled={!canExecute}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: canExecute ? "var(--accent, #2891DA)" : "var(--bg-secondary, #f3f4f6)",
              color:      canExecute ? "#fff" : "var(--text-muted, #9ca3af)",
              cursor:     canExecute ? "pointer" : "not-allowed",
              border:     "none",
            }}
          >
            {plan.executing ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Play size={12} />
            )}
            {plan.executing ? "Executing…" : "Execute Plan"}
          </button>
        </div>
      </div>

      {/* ── Execution progress strip ────────────────────────────────────────── */}
      {runningStep && (
        <div
          className="flex items-center gap-2 px-4 py-2 text-xs"
          style={{
            background:   "rgba(40,145,218,0.06)",
            borderBottom: "1px solid rgba(40,145,218,0.15)",
            color:        "var(--accent, #2891DA)",
          }}
        >
          <Loader2 size={11} className="animate-spin flex-shrink-0" />
          <span>
            Executing step {(plan.executingIndex ?? 0) + 1} of {plan.steps.length}
            {" · "}
            <span className="font-medium">{runningStep.title}</span>
          </span>
        </div>
      )}

      {/* ── Step list ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col divide-y divide-[var(--border,#f3f4f6)]">
        {plan.steps.length === 0 && (
          <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted, #9ca3af)" }}>
            No steps yet. Add at least one step to execute.
          </div>
        )}

        {plan.steps.map((step, idx) => {
          const isEditing   = editingId === step.id;
          const isRunning   = step.status === "running";
          const isDone      = step.status === "done";
          const isError     = step.status === "error";
          const isActive    = plan.executing && plan.executingIndex === idx;
          const canDrag     = !isExecuting && !plan.executing && !isEditing;
          const isDragOver  = dragOverIdx === idx;
          const isDragging  = dragSrcIdx.current === idx;

          return (
            <div
              key={step.id}
              draggable={canDrag}
              onDragStart={canDrag ? handleDragStart(idx) : undefined}
              onDragOver={canDrag ? handleDragOver(idx) : undefined}
              onDrop={canDrag ? handleDrop(idx) : undefined}
              onDragEnd={handleDragEnd}
              className="px-4 py-3 transition-colors relative"
              style={{
                background:  isRunning ? "rgba(40,145,218,0.04)" : "transparent",
                borderLeft:  isRunning ? "3px solid var(--accent, #2891DA)" : "3px solid transparent",
                opacity:     isDragging ? 0.4 : 1,
                cursor:      canDrag ? "grab" : "default",
              }}
            >
              {/* Drop indicator line */}
              {isDragOver && dragSrcIdx.current !== idx && (
                <div
                  style={{
                    position: "absolute",
                    top: -1,
                    left: 12,
                    right: 12,
                    height: 2,
                    borderRadius: 2,
                    background: "var(--accent, #2891DA)",
                    pointerEvents: "none",
                  }}
                />
              )}

              {isEditing ? (
                /* ── Inline edit form ─────────────────────────────────────── */
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                      if (e.key === "Escape") cancelEdit();
                    }}
                    placeholder="Step title"
                    className="w-full text-sm font-semibold rounded px-2 py-1.5 outline-none"
                    style={{
                      border: "1px solid var(--accent, #2891DA)",
                      background: "var(--bg-primary, #fff)",
                      color: "var(--text-primary, #111)",
                    }}
                  />
                  <input
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
                      if (e.key === "Escape") cancelEdit();
                    }}
                    placeholder="Description (optional)"
                    className="w-full text-sm rounded px-2 py-1.5 outline-none"
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      background: "var(--bg-primary, #fff)",
                      color: "var(--text-secondary, #6b7280)",
                    }}
                  />
                  <textarea
                    value={editMsg}
                    onChange={(e) => setEditMsg(e.target.value)}
                    placeholder="Agent message (what gets sent to the BI engine)"
                    rows={2}
                    className="w-full text-sm rounded px-2 py-1.5 outline-none resize-none"
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      background: "var(--bg-secondary, #f9fafb)",
                      color: "var(--text-secondary, #6b7280)",
                      fontFamily: "inherit",
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={commitEdit}
                      className="flex items-center gap-1 text-sm px-2.5 py-1 rounded font-medium"
                      style={{ background: "var(--accent, #2891DA)", color: "#fff", border: "none" }}
                    >
                      <Check size={11} /> Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex items-center gap-1 text-sm px-2.5 py-1 rounded font-medium"
                      style={{ background: "var(--bg-secondary, #f3f4f6)", color: "var(--text-secondary, #6b7280)", border: "none" }}
                    >
                      <X size={11} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal step row ─────────────────────────────────────── */
                <div className="flex items-start gap-3">
                  {/* Drag handle — only shown when reordering is allowed */}
                  {canDrag && (
                    <div
                      className="flex-shrink-0 mt-0.5"
                      style={{ color: "var(--text-muted, #d1d5db)", cursor: "grab" }}
                      title="Drag to reorder"
                    >
                      <GripVertical size={14} />
                    </div>
                  )}

                  {/* Status icon + badge */}
                  <div className="flex items-center gap-1.5 mt-0.5 flex-shrink-0">
                    {statusIcon(step.status, isActive)}
                    <StepBadge n={idx + 1} status={step.status} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold leading-snug"
                      style={{
                        color:          isDone ? "var(--text-muted, #9ca3af)" : "var(--text-primary, #111)",
                        textDecoration: isDone ? "line-through" : "none",
                      }}
                    >
                      {step.title}
                    </p>
                    {step.description && (
                      <p className="text-sm mt-0.5 leading-relaxed" style={{ color: "var(--text-muted, #9ca3af)" }}>
                        {step.description}
                      </p>
                    )}
                    {isError && step.errorMessage && (
                      <p className="text-xs mt-1 font-medium" style={{ color: "#ef4444" }}>
                        ✗ {step.errorMessage}
                      </p>
                    )}
                  </div>

                  {/* Actions — hidden while executing */}
                  {!isExecuting && !isDone && !isRunning && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => startEdit(step)}
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--text-muted, #9ca3af)" }}
                        title="Edit step"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => deleteStep(step.id)}
                        className="p-1 rounded transition-colors"
                        style={{ color: "var(--text-muted, #9ca3af)" }}
                        title="Delete step"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Add step section ───────────────────────────────────────────────── */}
      {!isExecuting && !plan.executing && (
        <div style={{ borderTop: "1px solid var(--border, #f3f4f6)" }}>
          {showAdd ? (
            <div className="px-4 py-3 flex flex-col gap-2">
              <input
                ref={addTitleRef}
                value={addTitle}
                onChange={(e) => setAddTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitAdd(); }
                  if (e.key === "Escape") { setShowAdd(false); setAddTitle(""); setAddDesc(""); setAddMsg(""); }
                }}
                placeholder="Step title"
                className="w-full text-sm font-semibold rounded px-2 py-1.5 outline-none"
                style={{
                  border: "1px solid var(--accent, #2891DA)",
                  background: "var(--bg-primary, #fff)",
                  color: "var(--text-primary, #111)",
                }}
              />
              <input
                value={addDesc}
                onChange={(e) => setAddDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitAdd(); }
                  if (e.key === "Escape") { setShowAdd(false); setAddTitle(""); setAddDesc(""); setAddMsg(""); }
                }}
                placeholder="Description (optional)"
                className="w-full text-sm rounded px-2 py-1.5 outline-none"
                style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--bg-primary, #fff)",
                  color: "var(--text-secondary, #6b7280)",
                }}
              />
              <textarea
                value={addMsg}
                onChange={(e) => setAddMsg(e.target.value)}
                placeholder="Agent message — leave blank to use title as the prompt"
                rows={2}
                className="w-full text-sm rounded px-2 py-1.5 outline-none resize-none"
                style={{
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--bg-secondary, #f9fafb)",
                  color: "var(--text-secondary, #6b7280)",
                  fontFamily: "monospace",
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={commitAdd}
                  disabled={!addTitle.trim()}
                  className="flex items-center gap-1 text-sm px-2.5 py-1 rounded font-medium"
                  style={{
                    background: addTitle.trim() ? "var(--accent, #2891DA)" : "var(--bg-secondary, #f3f4f6)",
                    color:      addTitle.trim() ? "#fff" : "var(--text-muted, #9ca3af)",
                    border: "none",
                    cursor: addTitle.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  <Plus size={11} /> Add step
                </button>
                <button
                  onClick={() => { setShowAdd(false); setAddTitle(""); setAddDesc(""); setAddMsg(""); }}
                  className="flex items-center gap-1 text-sm px-2.5 py-1 rounded font-medium"
                  style={{ background: "var(--bg-secondary, #f3f4f6)", color: "var(--text-secondary, #6b7280)", border: "none" }}
                >
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-xs transition-colors"
              style={{
                color:      "var(--text-muted, #9ca3af)",
                background: "transparent",
                border:     "none",
                cursor:     "pointer",
              }}
            >
              <Plus size={13} />
              Add step
            </button>
          )}
        </div>
      )}

      {/* ── Keyboard hint ──────────────────────────────────────────────────── */}
      {!plan.executing && plan.steps.length > 0 && (
        <div
          className="px-4 py-2.5 flex items-center gap-2 text-xs"
          style={{
            borderTop:  "1px solid var(--border, #f3f4f6)",
            color:      "var(--text-muted, #9ca3af)",
            background: "var(--bg-secondary, #f9fafb)",
            fontSize:   "12px",
          }}
        >
          <kbd
            className="px-1.5 py-0.5 rounded font-mono"
            style={{ background: "var(--bg-primary, #fff)", border: "1px solid var(--border, #e5e7eb)", fontSize: "11px" }}
          >
            ⌃⇧ Enter
          </kbd>
          <span>to execute · drag to reorder · edit any step before running</span>
        </div>
      )}
    </div>
  );
}

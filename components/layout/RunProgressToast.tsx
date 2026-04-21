"use client";

import { useEffect, useRef, useState } from "react";
import { useActiveRuns, useNotifications } from "@/lib/use-run-store";
import { runStore } from "@/lib/run-store";
import type { RunNotification } from "@/lib/run-store";
import { X, CheckCircle, AlertCircle, Ban, Square } from "lucide-react";
import Link from "next/link";

// Tracks which completed notification ids have already been shown as a flash toast
const shownIds = new Set<string>();

function CompletionFlash({ notif, onDone }: { notif: RunNotification; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  const cfg = {
    done:    { icon: <CheckCircle size={14} style={{ color: "#22c55e" }} />, label: "Completed", color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.25)" },
    aborted: { icon: <Ban         size={14} style={{ color: "#f59e0b" }} />, label: "Aborted",   color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.25)" },
    failed:  { icon: <AlertCircle size={14} style={{ color: "#ef4444" }} />, label: "Failed",    color: "#ef4444", bg: "rgba(239,68,68,0.08)",  border: "rgba(239,68,68,0.25)"  },
  }[notif.status];

  return (
    <div
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl shadow-lg"
      style={{
        background: "#ffffff",
        border: `1px solid ${cfg.border}`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        minWidth: 260, maxWidth: 340,
      }}
    >
      {cfg.icon}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {notif.workflowName}
        </p>
        <p className="text-xs" style={{ color: cfg.color }}>{cfg.label}</p>
      </div>
      <Link
        href={`/workflows/${notif.workflowId}/edit`}
        className="text-xs font-medium px-2 py-1 rounded-lg transition-colors hover:bg-black/5 shrink-0"
        style={{ color: "var(--accent)" }}
      >
        View →
      </Link>
      <button onClick={onDone} className="p-0.5 rounded hover:bg-black/7 transition-colors shrink-0"
        style={{ color: "var(--text-muted)" }}>
        <X size={11} />
      </button>
    </div>
  );
}

function ActiveRunToast({ run }: { run: ReturnType<typeof useActiveRuns>[number] }) {
  const doneCount    = Object.values(run.nodeStates).filter((s) => s === "done").length;
  const totalCount   = run.nodes.length;
  const currentNode  = run.nodes.find((n) => run.nodeStates[n.id] === "running");
  const progress     = totalCount > 0 ? doneCount / totalCount : 0;

  return (
    <div
      className="flex flex-col gap-2 px-3 py-2.5 rounded-xl shadow-lg"
      style={{
        background: "#ffffff",
        border: "1px solid rgba(40,145,218,0.25)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        minWidth: 260, maxWidth: 340,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="animate-spin shrink-0" style={{
          display: "block", width: 12, height: 12, borderRadius: "50%",
          border: "2px solid rgba(40,145,218,0.2)", borderTopColor: "#2891DA",
        }} />
        <p className="text-xs font-semibold flex-1 truncate" style={{ color: "var(--text-primary)" }}>
          {run.workflowName}
        </p>
        <button
          onClick={() => runStore.abortRun(run.workflowId)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors hover:bg-red-50"
          style={{ color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}
          title="Abort run"
        >
          <Square size={9} fill="#DC2626" />
          Abort
        </button>
      </div>

      {/* Progress bar */}
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: "var(--bg-tertiary)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${progress * 100}%`, background: "#2891DA" }}
        />
      </div>

      {/* Current step */}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {currentNode
            ? <>Running <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{currentNode.label}</span>…</>
            : "Finishing…"}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {doneCount}/{totalCount} steps
        </p>
      </div>
    </div>
  );
}

export default function RunProgressToast() {
  const activeRuns    = useActiveRuns();
  const notifications = useNotifications();
  const [flashes, setFlashes] = useState<RunNotification[]>([]);
  const prevNotifIds  = useRef<Set<string>>(new Set());

  // Detect newly completed runs and queue them as flash toasts
  useEffect(() => {
    const current = new Set(notifications.map((n) => n.id));
    for (const n of notifications) {
      if (!shownIds.has(n.id) && !prevNotifIds.current.has(n.id)) {
        shownIds.add(n.id);
        setFlashes((f) => [...f, n]);
      }
    }
    prevNotifIds.current = current;
  }, [notifications]);

  const dismissFlash = (id: string) => setFlashes((f) => f.filter((n) => n.id !== id));

  if (activeRuns.length === 0 && flashes.length === 0) return null;

  return (
    <div
      className="fixed z-[200] flex flex-col gap-2"
      style={{ bottom: 40, right: 20, pointerEvents: "none" }}
    >
      <div className="flex flex-col gap-2" style={{ pointerEvents: "auto" }}>
        {/* Active runs */}
        {activeRuns.map((run) => (
          <ActiveRunToast key={run.runId} run={run} />
        ))}
        {/* Completion flashes */}
        {flashes.map((n) => (
          <CompletionFlash key={n.id} notif={n} onDone={() => dismissFlash(n.id)} />
        ))}
      </div>
    </div>
  );
}

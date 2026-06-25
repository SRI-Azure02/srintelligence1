"use client";

// â”€â”€ Brand tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const INK    = "#1A3358";
const ACCENT = "#E26B2C";
const BG     = "#F5F5F5";

const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
  <filter id='g'>
    <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/>
    <feColorMatrix type='saturate' values='0'/>
  </filter>
  <rect width='200' height='200' filter='url(#g)' opacity='1'/>
</svg>`;
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus, Pin, LayoutGrid, Wrench, X,
  TrendingUp, Layers, GitFork, GitPullRequestArrow,
  Activity, Cpu, FileText, Search,
  List, SortAsc, ChevronDown, Check,
  Play, Copy, Share2, Square, Edit2,
  ExternalLink, BookOpen, Loader2,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import WorkflowCardComponent from "@/components/workflows/WorkflowCard";
import { WorkflowCard } from "@/lib/types";
import { loadSavedWorkflows, deleteWorkflow } from "@/lib/workflow-storage";
import { runStore } from "@/lib/run-store";
import { useActiveRun, useLastRun } from "@/lib/use-run-store";
import ShareModal from "@/components/workflows/ShareModal";
import StoryReportModal from "@/src/components/story/StoryReportModal";
import type { StoryReport } from "@/src/lib/llm/anthropic";

// â”€â”€ Agent icon map â€” keep in sync with WorkflowCard.tsx AGENT_ICONS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TMPL_ICONS: Record<string, LucideIcon> = {
  "sri-analyst":    Search,
  "sri-forecast":   TrendingUp,
  "sri-clustering": Layers,
  "sri-mtree":      GitFork,
  "sri-causal":     GitPullRequestArrow,
  prophet:          TrendingUp,
  sarima:           Activity,
  "holt-winters":   TrendingUp,
  xgboost:          Cpu,
  hybrid:           TrendingUp,
  "auto-forecast":  TrendingUp,
  gmm:              Layers,
  kmeans:           Layers,
  kmedoids:         Layers,
  dbscan:           Layers,
  hierarchical:     Layers,
  "auto-cluster":   Layers,
  output:           FileText,
};

function TemplateChain({ chain }: { chain: WorkflowCard["agentChain"] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chain.map((step, i) => {
        const Icon = TMPL_ICONS[step.type] ?? TrendingUp;
        return (
          <span key={step.id} className="flex items-center gap-1.5">
            <span className="flex items-center justify-center w-6 h-6 rounded"
              style={{ background: "var(--bg-tertiary)" }} title={step.label}>
              <Icon size={12} style={{ color: "#111111" }} strokeWidth={1.6} />
            </span>
            {i < chain.length - 1 && (
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>â†’</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

function TemplateName({ name }: { name: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (el) setTruncated(el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth);
  });
  return (
    <p ref={ref} className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}
      title={truncated ? name : undefined}>
      {name}
    </p>
  );
}

function TemplatePickerModal({ workflows, onClose }: { workflows: WorkflowCard[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col overflow-hidden"
        style={{ background: "#ffffff", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Choose a Template</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Start from an existing workflow</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
            style={{ color: "var(--text-muted)" }}>
            <X size={15} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-2">
          {workflows.map((wf) => (
            <Link key={wf.id} href={`/workflows/${wf.id}/edit`} onClick={onClose}
              className="flex flex-col gap-2 p-3 rounded-xl transition-colors hover:bg-black/4"
              style={{ border: "1px solid var(--border)" }}>
              <TemplateName name={wf.name} />
              {wf.description && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{wf.description}</p>
              )}
              <TemplateChain chain={wf.agentChain} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// â”€â”€ Sort options â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type SortKey = "created" | "modified" | "lastRun" | "name";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",     label: "Name (Aâ€“Z)" },
  { key: "created",  label: "Date created" },
  { key: "modified", label: "Date modified" },
  { key: "lastRun",  label: "Last run" },
];

function sortWorkflows(wfs: WorkflowCard[], key: SortKey): WorkflowCard[] {
  return [...wfs].sort((a, b) => {
    switch (key) {
      case "name":
        return a.name.localeCompare(b.name);
      case "created":
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
      case "modified":
        return (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? "");
      case "lastRun":
        // "just now" / "3m ago" style strings â€” sort by runCount as fallback
        return b.runCount - a.runCount;
    }
  });
}

// â”€â”€ List-view row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WorkflowListRow({
  workflow,
  onDuplicate,
  onDelete,
}: {
  workflow: WorkflowCard;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const router = useRouter();
  const [showShare,     setShowShare]     = useState(false);
  const [duplicated,    setDuplicated]    = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [storyReport,   setStoryReport]   = useState<StoryReport | null>(null);

  const activeRun = useActiveRun(workflow.id);
  const lastRun   = useLastRun(workflow.id);
  const isRunning = !!activeRun;

  const handleRun = () => {
    const nodes = workflow.agentChain.map((step) => ({
      id:        step.id,
      agentType: step.type,
      label:     step.label,
      prompt:    step.prompt,
    }));
    runStore.startRun(workflow.id, workflow.name, nodes);
  };

  const handleDuplicate = () => {
    onDuplicate?.(workflow.id);
    setDuplicated(true);
    setTimeout(() => setDuplicated(false), 1500);
  };

  const handleGenerateReport = async () => {
    if (reportLoading) return;
    setReportLoading(true);
    try {
      const messages = workflow.agentChain.map((step) => ({
        role: "agent",
        content: `Agent: ${step.label}\nType: ${step.type}\nPrompt: ${step.prompt ?? "â€”"}`,
        agentActivity: { routedTo: step.label },
      }));
      const res = await fetch("/api/agent/report", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadTitle: workflow.name, messages }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { report: StoryReport };
      setStoryReport(data.report);
    } catch (err) {
      console.error("[ExecutiveBrief]", err);
    } finally {
      setReportLoading(false);
    }
  };

  // â”€â”€ Running state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isRunning && activeRun) {
    const doneCount    = activeRun.nodes.filter((n) => activeRun.nodeStates[n.id] === "done").length;
    const totalCount   = activeRun.nodes.length;
    const currentNode  = activeRun.nodes.find((n) => activeRun.nodeStates[n.id] === "running");
    const pct          = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
        style={{ background: "rgba(226,107,44,0.04)", border: "1px solid rgba(226,107,44,0.22)" }}>

        {/* Node status icons â€” same 32px size as card view */}
        <div className="flex items-center gap-1 shrink-0">
          {activeRun.nodes.map((node) => {
            const state = activeRun.nodeStates[node.id] ?? "pending";
            const Icon  = TMPL_ICONS[node.agentType] ?? TrendingUp;
            const isDone    = state === "done";
            const isActive  = state === "running";
            const isPending = state === "pending";
            return (
              <span key={node.id} className="relative flex items-center justify-center w-8 h-8 rounded-lg"
                style={{
                  background: isDone   ? "rgba(34,197,94,0.12)"
                    : isActive ? "rgba(226,107,44,0.12)"
                    : "var(--bg-tertiary)",
                }}
                title={node.label}>
                <Icon size={15} strokeWidth={1.6} style={{
                  color:   isDone   ? "#22c55e"
                    : isActive ? ACCENT
                    : "var(--text-muted)",
                  opacity: isPending ? 0.35 : 1,
                }} />
                {/* done badge */}
                {isDone && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                    style={{ background: "#22c55e" }}>
                    <Check size={8} strokeWidth={3} style={{ color: "#fff" }} />
                  </span>
                )}
                {/* running spinner */}
                {isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5">
                    <span className="animate-spin block w-3.5 h-3.5 rounded-full"
                      style={{ border: "1.5px solid rgba(226,107,44,0.2)", borderTopColor: ACCENT }} />
                  </span>
                )}
              </span>
            );
          })}
        </div>

        {/* Workflow name + current step */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}
            title={workflow.name}>
            {workflow.name}
          </p>
          <p className="text-xs truncate" style={{ color: ACCENT }}>
            {currentNode ? `Running: ${currentNode.label}` : "Finishing upâ€¦"}
          </p>
        </div>

        {/* Progress bar + counter */}
        <div className="flex items-center gap-2 shrink-0" style={{ minWidth: 120 }}>
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(226,107,44,0.12)", minWidth: 80 }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: ACCENT }} />
          </div>
          <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--text-muted)" }}>
            {doneCount}/{totalCount}
          </span>
        </div>

        {/* Abort */}
        <button onClick={() => runStore.abortRun(workflow.id)}
          className="p-1.5 rounded-lg transition-colors hover:bg-red-50 shrink-0"
          style={{ color: "#DC2626" }} title="Abort run">
          <Square size={14} />
        </button>
      </div>
    );
  }

  // â”€â”€ Results-ready state (run just completed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const hasResults = lastRun && lastRun.status === "done" && Object.keys(lastRun.nodeArtifacts ?? {}).length > 0;
  if (hasResults && !isRunning) {
    const nodes = lastRun!.nodes;
    return (
      <>
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.2)" }}>

          {/* Completed node icons */}
          <div className="flex items-center gap-1 shrink-0">
            {nodes.map((node) => {
              const Icon = TMPL_ICONS[node.agentType] ?? TrendingUp;
              return (
                <span key={node.id} className="relative flex items-center justify-center w-8 h-8 rounded-lg"
                  style={{ background: "rgba(34,197,94,0.1)" }} title={node.label}>
                  <Icon size={15} strokeWidth={1.6} style={{ color: "#22c55e" }} />
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                    style={{ background: "#22c55e" }}>
                    <Check size={8} strokeWidth={3} style={{ color: "#fff" }} />
                  </span>
                </span>
              );
            })}
          </div>

          {/* Name + status */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}
              title={workflow.name}>{workflow.name}</p>
            <p className="text-xs" style={{ color: "#22c55e" }}>Run complete Â· results ready</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Last Results */}
            <button
              onClick={() => router.push(`/workflows/${workflow.id}/edit`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
              style={{ background: "rgba(34,197,94,0.12)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.25)" }}>
              <ExternalLink size={12} />
              Last Results
            </button>

            {/* Executive Brief */}
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-blue-50 disabled:opacity-40"
              style={{ color: ACCENT, border: "1px solid rgba(226,107,44,0.35)", background: "rgba(226,107,44,0.04)" }}>
              {reportLoading ? <><Loader2 size={12} className="animate-spin" />Generatingâ€¦</> : <><BookOpen size={12} />Executive Brief</>}
            </button>

            {/* Run Again */}
            <button
              onClick={handleRun}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
              style={{ background: ACCENT, color: "white" }}>
              <Play size={12} fill="white" strokeWidth={0} />
              Run Again
            </button>
          </div>

          {/* Dismiss */}
          <button onClick={() => runStore.dismiss(lastRun!.id)}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/5 shrink-0"
            style={{ color: "var(--text-muted)" }} title="Dismiss">
            <X size={13} />
          </button>
        </div>

        {storyReport && (
          <StoryReportModal report={storyReport} threadTitle={workflow.name} onClose={() => setStoryReport(null)} />
        )}
        {showShare && (
          <ShareModal workflowId={workflow.id} workflowName={workflow.name} onClose={() => setShowShare(false)} />
        )}
      </>
    );
  }

  // â”€â”€ Normal (idle) state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const idleLastResults = lastRun?.status === "done" && Object.keys(lastRun.nodeArtifacts ?? {}).length > 0;

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-black/3"
        style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>

        {/* Chain icons */}
        <div className="flex items-center gap-1 shrink-0">
          {workflow.agentChain.slice(0, 4).map((step) => {
            const Icon = TMPL_ICONS[step.type] ?? TrendingUp;
            return (
              <span key={step.id} className="flex items-center justify-center w-6 h-6 rounded"
                style={{ background: "var(--bg-tertiary)" }} title={step.label}>
                <Icon size={12} style={{ color: "#111111" }} strokeWidth={1.6} />
              </span>
            );
          })}
          {workflow.agentChain.length > 4 && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>+{workflow.agentChain.length - 4}</span>
          )}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}
            title={workflow.name}>
            {workflow.name}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {workflow.lastRun} Â· #{workflow.runCount} runs
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">

          {/* Last Results â€” labeled, green tint */}
          {idleLastResults && (
            <button
              onClick={() => router.push(`/workflows/${workflow.id}/edit`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-85"
              style={{ background: "rgba(34,197,94,0.08)", color: "#16a34a", border: "1px solid rgba(34,197,94,0.25)", whiteSpace: "nowrap" }}
              title="View last run results">
              <ExternalLink size={12} />
              Last Results
            </button>
          )}

          {/* Executive Brief â€” labeled, blue ghost */}
          <button
            onClick={handleGenerateReport}
            disabled={reportLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:bg-blue-50 disabled:opacity-40"
            style={{ color: ACCENT, border: "1px solid rgba(226,107,44,0.35)", background: "rgba(226,107,44,0.04)", whiteSpace: "nowrap" }}
            title="Generate an AI executive brief">
            {reportLoading
              ? <><Loader2 size={12} className="animate-spin" />Generatingâ€¦</>
              : <><BookOpen size={12} />Executive Brief</>}
          </button>

          {/* Run Again â€” primary blue */}
          <button
            onClick={handleRun}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
            style={{ background: ACCENT, color: "white", whiteSpace: "nowrap" }}
            title="Run workflow">
            <Play size={12} fill="white" strokeWidth={0} />
            Run Again
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: "var(--border)", flexShrink: 0 }} />

          {/* Icon-only utility buttons */}
          <button
            onClick={handleDuplicate}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: duplicated ? "var(--accent)" : "var(--text-muted)" }}
            title={duplicated ? "Duplicated!" : "Duplicate"}>
            {duplicated ? <Check size={14} /> : <Copy size={14} />}
          </button>

          <button
            onClick={() => setShowShare(true)}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-muted)" }} title="Share">
            <Share2 size={14} />
          </button>

          <Link href={`/workflows/${workflow.id}/edit`}
            className="p-1.5 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--accent)" }} title="Open in canvas">
            <Edit2 size={14} />
          </Link>

          {onDelete && (
            <button onClick={() => onDelete(workflow.id)}
              className="p-1.5 rounded-lg transition-colors hover:bg-red-50"
              style={{ color: "var(--text-muted)" }} title="Delete">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {storyReport && (
        <StoryReportModal report={storyReport} threadTitle={workflow.name} onClose={() => setStoryReport(null)} />
      )}
      {showShare && (
        <ShareModal
          workflowId={workflow.id}
          workflowName={workflow.name}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}

// â”€â”€ Sort dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function SortDropdown({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = SORT_OPTIONS.find((o) => o.key === value)?.label ?? "Sort";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-black/5"
        style={{ border: `1px solid ${INK}20`, borderRadius: 9999, color: INK, background: "#F5F5F5" }}
      >
        <SortAsc size={13} />
        {label}
        <ChevronDown size={11} style={{ opacity: 0.6, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20 shadow-lg"
          style={{ background: "#ffffff", border: "1px solid var(--border)", minWidth: 160 }}>
          {SORT_OPTIONS.map((opt) => (
            <button key={opt.key} onClick={() => { onChange(opt.key); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors hover:bg-black/5 text-left"
              style={{ color: value === opt.key ? "var(--accent)" : "var(--text-primary)", fontWeight: value === opt.key ? 600 : 400 }}>
              {opt.label}
              {value === opt.key && <Check size={11} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function WorkflowsPage() {
  const router = useRouter();
  const [showTemplate, setShowTemplate] = useState(false);
  const [workflows, setWorkflows]       = useState<WorkflowCard[]>([]);
  const [query, setQuery]               = useState("");
  const [viewMode, setViewMode]         = useState<"grid" | "list">("grid");
  const [sortKey, setSortKey]           = useState<SortKey>("modified");

  useEffect(() => {
    setWorkflows(loadSavedWorkflows());
    const handleUpdate = () => setWorkflows(loadSavedWorkflows());
    window.addEventListener("sri_workflows_updated", handleUpdate);
    return () => window.removeEventListener("sri_workflows_updated", handleUpdate);
  }, []);

  // Page-level keyboard shortcuts
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag    = document.activeElement?.tagName;
      const active = document.activeElement as HTMLElement | null;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || active?.isContentEditable;

      // "/" â€” focus search (when not already in a field)
      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      // Escape â€” blur search input
      if (e.key === "Escape") {
        searchRef.current?.blur();
        return;
      }

      // Below shortcuts should NOT fire when typing
      if (inField) return;

      // N â€” new workflow
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        router.push("/workflows/new/edit");
      }
      // 1 â€” grid view
      if (e.key === "1") setViewMode("grid");
      // 2 â€” list view
      if (e.key === "2") setViewMode("list");
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [router]);

  const handleDuplicate = (id: string) => {
    const source = workflows.find((w) => w.id === id);
    if (!source) return;
    const copy: WorkflowCard = {
      ...source,
      id: `${source.id}-copy-${Date.now()}`,
      name: `${source.name} (Copy)`,
      lastRun: "â€”", runCount: 0, status: "success",
    };
    setWorkflows((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const handleDelete = (id: string) => {
    deleteWorkflow(id);
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? workflows.filter(
          (w) =>
            w.name.toLowerCase().includes(q) ||
            w.description?.toLowerCase().includes(q) ||
            w.agentChain.some((s) => s.label.toLowerCase().includes(q)),
        )
      : workflows;
    return sortWorkflows(base, sortKey);
  }, [workflows, query, sortKey]);

  return (
    <div className="relative flex flex-col h-full overflow-y-auto" style={{ background: BG }}>
      {/* Noise texture */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: GRAIN_URL, backgroundRepeat: "repeat", backgroundSize: "200px 200px", opacity: 0.22, pointerEvents: "none", zIndex: 0 }} />

      <div className="relative z-10 w-full flex flex-col">

        {/* SRI Masthead */}
        <div className="px-6 pt-4">
          <div style={{ borderTop: `3px double ${INK}`, paddingTop: "5px" }}>
            <div style={{ borderTop: `1px solid ${INK}`, paddingTop: "4px", paddingBottom: "4px", textAlign: "center" }}>
              <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "12px", fontWeight: 800, letterSpacing: "0.38em", textTransform: "uppercase", color: INK }}>
                Workflows
              </span>
            </div>
            <div style={{ borderTop: `1px solid ${INK}` }} />
          </div>
        </div>

        {/* White ribbon toolbar */}
        <div className="px-6 shrink-0 sticky top-0 z-10" style={{ background: BG }}>
          <div className="flex items-center gap-2 px-4 py-2.5"
            style={{ background: "#fff", borderBottom: `1px solid rgba(26,51,88,0.18)` }}>

            {/* Search — pill */}
            <div className="relative flex-1 max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: `${INK}60` }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Search workflows… ("/" to focus)'
                className="w-full text-xs pl-8 pr-8 py-1.5 outline-none"
                style={{ border: `1px solid ${INK}20`, borderRadius: 9999, background: "#F5F5F5", color: INK }}
              />
              {query && (
                <button onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-black/5 transition-colors"
                  style={{ color: `${INK}60` }}>
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Sort — pill */}
            <SortDropdown value={sortKey} onChange={setSortKey} />

            {/* View toggle — pill buttons */}
            <div className="flex items-center shrink-0 rounded-full overflow-hidden"
              style={{ border: `1px solid ${INK}20` }}>
              <button
                onClick={() => setViewMode("grid")}
                className="flex items-center justify-center px-2.5 py-1.5 transition-colors"
                style={{ background: viewMode === "grid" ? ACCENT : "transparent", color: viewMode === "grid" ? "#fff" : `${INK}70` }}
                title="Grid view">
                <LayoutGrid size={13} />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className="flex items-center justify-center px-2.5 py-1.5 transition-colors"
                style={{ background: viewMode === "list" ? ACCENT : "transparent", color: viewMode === "list" ? "#fff" : `${INK}70` }}
                title="List view">
                <List size={13} />
              </button>
            </div>

            {/* New workflow — orange circle "+" */}
            <Link
              href="/workflows/new/edit"
              className="flex items-center justify-center shrink-0 rounded-full transition-colors hover:opacity-85"
              style={{ width: 30, height: 30, background: ACCENT, color: "#fff" }}
              title="New workflow">
              <Plus size={15} strokeWidth={2.5} />
            </Link>
          </div>
        </div>

        {/* Content area */}
        <div className="px-6 pt-4 flex flex-col gap-4">

        {/* Results count when searching */}
        {query && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {filtered.length === 0
              ? "No workflows match your search."
              : `${filtered.length} workflow${filtered.length !== 1 ? "s" : ""} found`}
          </p>
        )}

        {/* Empty state (no workflows at all) */}
        {workflows.length === 0 && !query && (
          <div className="flex flex-col items-center justify-center py-16 rounded-xl gap-3"
            style={{ border: "1.5px dashed var(--border)", color: "var(--text-muted)" }}>
            <Pin size={28} strokeWidth={1.5} />
            <p className="text-sm font-medium">No saved workflows yet</p>
            <p className="text-xs text-center max-w-xs">
              Open a chat session, run some analysis, then click <strong>Save as Workflow</strong> in the chat header.
            </p>
          </div>
        )}

        {/* Grid view */}
        {viewMode === "grid" && filtered.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map((wf) => (
              <WorkflowCardComponent key={wf.id} workflow={wf} onDuplicate={handleDuplicate} onDelete={handleDelete} />
            ))}

            {/* New Workflow card */}
            {!query && (
              <div className="rounded-xl p-4 flex flex-col gap-3"
                style={{ background: "transparent", border: "1.5px dashed var(--border)" }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <Plus size={16} style={{ color: "var(--text-muted)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>New Workflow</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Start from:</p>
                <div className="flex flex-col gap-2">
                  <Link href="/chat"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    <Pin size={12} /> Pin current chat conversation
                  </Link>
                  <Link href="/workflows/new/edit"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    <LayoutGrid size={12} /> Build from scratch (visual canvas)
                  </Link>
                  <button onClick={() => setShowTemplate(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5 text-left"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    <Wrench size={12} /> Use a template
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* List view */}
        {viewMode === "list" && filtered.length > 0 && (
          <div className="flex flex-col gap-2">
            {filtered.map((wf) => (
              <WorkflowListRow key={wf.id} workflow={wf} onDuplicate={handleDuplicate} onDelete={handleDelete} />
            ))}

            {/* New Workflow row â€” mirrors the grid card */}
            {!query && (
              <div className="rounded-xl px-4 py-3 flex flex-col gap-2.5"
                style={{ border: "1.5px dashed var(--border)" }}>
                <div className="flex items-center gap-2">
                  <Plus size={14} style={{ color: "var(--text-muted)" }} />
                  <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>New Workflow</span>
                  <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>â€” start from:</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href="/chat"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    <Pin size={12} />
                    Pin current chat conversation
                  </Link>
                  <Link href="/workflows/new/edit"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    <LayoutGrid size={12} />
                    Build from scratch (visual canvas)
                  </Link>
                  <button
                    onClick={() => setShowTemplate(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5 text-left"
                    style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    <Wrench size={12} />
                    Use a template
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        </div>{/* end content area */}
      </div>

      {showTemplate && <TemplatePickerModal workflows={workflows} onClose={() => setShowTemplate(false)} />}
    </div>
  );
}


"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  Plus, Pin, LayoutGrid, Wrench, X,
  TrendingUp, Layers, GitFork, GitPullRequestArrow,
  Activity, Cpu, FileText, Search,
  List, SortAsc, ChevronDown, Check,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import WorkflowCardComponent from "@/components/workflows/WorkflowCard";
import { WorkflowCard } from "@/lib/types";
import { loadSavedWorkflows, deleteWorkflow } from "@/lib/workflow-storage";

// ── Agent icon / color maps ───────────────────────────────────────────────────
const TMPL_ICONS: Record<string, LucideIcon> = {
  "sri-analyst": Search, "sri-forecast": TrendingUp, "sri-clustering": Layers,
  "sri-mtree": GitFork, "sri-causal": GitPullRequestArrow,
  prophet: TrendingUp, sarima: Activity, "holt-winters": TrendingUp,
  xgboost: Cpu, hybrid: TrendingUp, "auto-forecast": TrendingUp,
  gmm: Layers, kmeans: Layers, kmedoids: Layers, dbscan: Layers,
  hierarchical: Layers, "auto-cluster": Layers, output: FileText,
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
              <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>→</span>
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

// ── Sort options ──────────────────────────────────────────────────────────────
type SortKey = "created" | "modified" | "lastRun" | "name";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",     label: "Name (A–Z)" },
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
        // "just now" / "3m ago" style strings — sort by runCount as fallback
        return b.runCount - a.runCount;
    }
  });
}

// ── List-view row ─────────────────────────────────────────────────────────────
function WorkflowListRow({
  workflow,
  onDuplicate,
  onDelete,
}: {
  workflow: WorkflowCard;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors hover:bg-black/3"
      style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
      {/* Chain icons */}
      <div className="flex items-center gap-1 shrink-0">
        {workflow.agentChain.slice(0, 4).map((step, i) => {
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

      {/* Name + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
          {workflow.name}
        </p>
        {workflow.description && (
          <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{workflow.description}</p>
        )}
      </div>

      {/* Meta */}
      <p className="text-xs shrink-0 hidden lg:block" style={{ color: "var(--text-muted)", minWidth: 100 }}>
        {workflow.lastRun} · #{workflow.runCount}
      </p>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Link href={`/workflows/${workflow.id}/edit`}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
          style={{ color: "var(--accent)", border: "1px solid rgba(40,145,218,0.3)" }}>
          Open
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
  );
}

// ── Sort dropdown ─────────────────────────────────────────────────────────────
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-black/5"
        style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "var(--bg-secondary)" }}
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WorkflowsPage() {
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

  // Focus search on "/" key
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") searchRef.current?.blur();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleDuplicate = (id: string) => {
    const source = workflows.find((w) => w.id === id);
    if (!source) return;
    const copy: WorkflowCard = {
      ...source,
      id: `${source.id}-copy-${Date.now()}`,
      name: `${source.name} (Copy)`,
      lastRun: "—", runCount: 0, status: "success",
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
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
      <div className="px-5 py-5 w-full flex flex-col gap-4">

        {/* Header row */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold shrink-0" style={{ color: "var(--text-primary)" }}>My Workflows</h2>
          <Link
            href="/workflows/new/edit"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90 shrink-0 ml-auto"
            style={{ background: "#2891DA", color: "white" }}
          >
            <Plus size={15} />
            New Workflow
          </Link>
        </div>

        {/* Toolbar: search + view toggle + sort */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search workflows… ("/" to focus)'
              className="w-full text-xs rounded-lg pl-8 pr-8 py-1.5 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            />
            {query && (
              <button onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/7 transition-colors"
                style={{ color: "var(--text-muted)" }}>
                <X size={11} />
              </button>
            )}
          </div>

          {/* Sort */}
          <SortDropdown value={sortKey} onChange={setSortKey} />

          {/* View toggle */}
          <div className="flex items-center rounded-lg overflow-hidden shrink-0"
            style={{ border: "1px solid var(--border)" }}>
            <button
              onClick={() => setViewMode("grid")}
              className="flex items-center justify-center px-2.5 py-1.5 transition-colors"
              style={{ background: viewMode === "grid" ? "#2891DA" : "var(--bg-secondary)", color: viewMode === "grid" ? "#fff" : "var(--text-muted)" }}
              title="Grid view"
            >
              <LayoutGrid size={13} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className="flex items-center justify-center px-2.5 py-1.5 transition-colors"
              style={{ background: viewMode === "list" ? "#2891DA" : "var(--bg-secondary)", color: viewMode === "list" ? "#fff" : "var(--text-muted)" }}
              title="List view"
            >
              <List size={13} />
            </button>
          </div>
        </div>

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
          </div>
        )}
      </div>

      {showTemplate && <TemplatePickerModal workflows={workflows} onClose={() => setShowTemplate(false)} />}
    </div>
  );
}

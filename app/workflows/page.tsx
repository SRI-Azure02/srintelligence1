"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Plus, Pin, LayoutGrid, Wrench, X,
  TrendingUp, Layers, GitFork, GitPullRequestArrow,
  Activity, Cpu, FileText, Search,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import WorkflowCardComponent from "@/components/workflows/WorkflowCard";
import { WorkflowCard } from "@/lib/types";
import { loadSavedWorkflows, deleteWorkflow } from "@/lib/workflow-storage";

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

const TMPL_COLORS: Record<string, string> = {
  "sri-analyst":    "#2891DA",
  "sri-forecast":   "#34c98b",
  "sri-clustering": "#a78bfa",
  "sri-mtree":      "#fb923c",
  "sri-causal":     "#8b5cf6",
  prophet:          "#34c98b",
  sarima:           "#34c98b",
  "holt-winters":   "#34c98b",
  xgboost:          "#f5a623",
  hybrid:           "#34c98b",
  "auto-forecast":  "#2891DA",
  gmm:              "#a78bfa",
  kmeans:           "#a78bfa",
  kmedoids:         "#a78bfa",
  dbscan:           "#a78bfa",
  hierarchical:     "#a78bfa",
  "auto-cluster":   "#2891DA",
  output:           "#64748b",
};

function TemplateChain({ chain }: { chain: WorkflowCard["agentChain"] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chain.map((step, i) => {
        const Icon  = TMPL_ICONS[step.type]  ?? TrendingUp;
        const color = TMPL_COLORS[step.type] ?? "#4f8ef7";
        return (
          <span key={step.id} className="flex items-center gap-1.5">
            <span
              className="flex items-center justify-center w-6 h-6 rounded"
              style={{ background: "var(--bg-tertiary)" }}
              title={step.label}
            >
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
    <p
      ref={ref}
      className="text-sm font-semibold"
      style={{ color: "var(--text-primary)" }}
      title={truncated ? name : undefined}
    >
      {name}
    </p>
  );
}

function TemplatePickerModal({ workflows, onClose }: { workflows: WorkflowCard[]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col overflow-hidden"
        style={{ background: "#ffffff", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Choose a Template</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Start from an existing workflow</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors" style={{ color: "var(--text-muted)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 flex flex-col gap-2">
          {workflows.map((wf) => (
            <Link
              key={wf.id}
              href={`/workflows/${wf.id}/edit`}
              onClick={onClose}
              className="flex flex-col gap-2 p-3 rounded-xl transition-colors hover:bg-black/4"
              style={{ border: "1px solid var(--border)" }}
            >
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

export default function WorkflowsPage() {
  const [showTemplate, setShowTemplate] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowCard[]>([]);

  // Load from localStorage after hydration, and refresh on updates from chat
  useEffect(() => {
    setWorkflows(loadSavedWorkflows());
    const handleUpdate = () => setWorkflows(loadSavedWorkflows());
    window.addEventListener("sri_workflows_updated", handleUpdate);
    return () => window.removeEventListener("sri_workflows_updated", handleUpdate);
  }, []);

  const handleDuplicate = (id: string) => {
    const source = workflows.find((w) => w.id === id);
    if (!source) return;
    const copy: WorkflowCard = {
      ...source,
      id: `${source.id}-copy-${Date.now()}`,
      name: `${source.name} (Copy)`,
      lastRun: "—",
      runCount: 0,
      status: "success",
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

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: "var(--bg-primary)" }}>
      <div className="px-5 py-5 w-full flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>My Workflows</h2>
          <Link
            href="/workflows/new/edit"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-90"
            style={{ background: "#2891DA", color: "white" }}
          >
            <Plus size={15} />
            New Workflow
          </Link>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {workflows.length === 0 && (
            <div
              className="lg:col-span-2 flex flex-col items-center justify-center py-16 rounded-xl gap-3"
              style={{ border: "1.5px dashed var(--border)", color: "var(--text-muted)" }}
            >
              <Pin size={28} strokeWidth={1.5} />
              <p className="text-sm font-medium">No saved workflows yet</p>
              <p className="text-xs text-center max-w-xs">
                Open a chat session, run some analysis, then click <strong>Save as Workflow</strong> in the chat header.
              </p>
            </div>
          )}
          {workflows.map((wf) => (
            <WorkflowCardComponent key={wf.id} workflow={wf} onDuplicate={handleDuplicate} onDelete={handleDelete} />
          ))}

          {/* New Workflow card */}
          <div
            className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: "transparent", border: "1.5px dashed var(--border)" }}
          >
            <div className="flex items-center gap-2 mb-0.5">
              <Plus size={16} style={{ color: "var(--text-muted)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>New Workflow</span>
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Start from:</p>
            <div className="flex flex-col gap-2">
              <Link
                href="/chat"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                <Pin size={12} />
                Pin current chat conversation
              </Link>
              <Link
                href="/workflows/new/edit"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                <LayoutGrid size={12} />
                Build from scratch (visual canvas)
              </Link>
              <button
                onClick={() => setShowTemplate(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors hover:bg-black/5 text-left"
                style={{ color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              >
                <Wrench size={12} />
                Use a template
              </button>
            </div>
          </div>
        </div>
      </div>

      {showTemplate && <TemplatePickerModal workflows={workflows} onClose={() => setShowTemplate(false)} />}
    </div>
  );
}

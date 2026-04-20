"use client";

import { useState } from "react";
import { Handle, Position, NodeProps, useReactFlow } from "@xyflow/react";
import { Layers, TrendingUp, Activity, Cpu, GitFork, GitPullRequestArrow, FileText, Pencil, Trash2, Search, AlertCircle, Loader, CheckCircle, Hourglass, BarChart2 } from "lucide-react";

export type RunNodeStatus = "idle" | "pending" | "running" | "done";

type IconComponent = React.FC<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;

const AGENT_COLORS: Record<string, string> = {
  // SRI agents
  "sri-analyst":    "#2891DA",
  "sri-forecast":   "#34c98b",
  "sri-clustering": "#a78bfa",
  "sri-mtree":      "#fb923c",
  "sri-causal":     "#8b5cf6",
  // Forecast sub-types
  prophet:          "#34c98b",
  sarima:           "#34c98b",
  "holt-winters":   "#34c98b",
  xgboost:          "#f5a623",
  hybrid:           "#34c98b",
  "auto-forecast":  "#2891DA",
  // Clustering sub-types
  gmm:              "#a78bfa",
  kmeans:           "#a78bfa",
  kmedoids:         "#a78bfa",
  dbscan:           "#a78bfa",
  hierarchical:     "#a78bfa",
  "auto-cluster":   "#2891DA",
  output:           "#64748b",
};

const AGENT_ICONS: Record<string, IconComponent> = {
  // SRI agents
  "sri-analyst":    Search,
  "sri-forecast":   TrendingUp,
  "sri-clustering": Layers,
  "sri-mtree":      GitFork,
  "sri-causal":     GitPullRequestArrow,
  // Forecast sub-types
  prophet:          TrendingUp,
  sarima:           Activity,
  "holt-winters":   TrendingUp,
  xgboost:          Cpu,
  hybrid:           TrendingUp,
  "auto-forecast":  TrendingUp,
  // Clustering sub-types
  gmm:              Layers,
  kmeans:           Layers,
  kmedoids:         Layers,
  dbscan:           Layers,
  hierarchical:     Layers,
  "auto-cluster":   Layers,
  output:           FileText,
};

export default function AgentNode({ id, data, selected }: NodeProps) {
  const { deleteElements } = useReactFlow();
  const [hovered, setHovered] = useState(false);

  const agentType    = (data.agentType    as string)          ?? "sri-forecast";
  const color        = AGENT_COLORS[agentType] ?? "#4f8ef7";
  const label        = (data.label        as string)          ?? "Agent";
  const prompt       = (data.prompt       as string)          ?? "";
  const stepNumber   = (data.stepNumber   as string | number) ?? 1;
  const runPerSegment= (data.runPerSegment as boolean)        ?? false;
  const semanticModel= (data.semanticModel as string)         ?? "";
  const AgentIcon    = AGENT_ICONS[agentType] ?? TrendingUp;
  const runStatus    = (data.runStatus    as RunNodeStatus)   ?? "idle";
  const onViewReport = data.onViewReport  as (() => void)     | undefined;

  // A node needs attention when the prompt hasn't been filled in yet
  const needsInput  = !prompt.trim();
  const isExecuting = runStatus === "running" || runStatus === "pending";

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteElements({ nodes: [{ id }] });
  };

  return (
    <div
      className="relative rounded-xl overflow-visible"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 210,
        background: "#ffffff",
        border: `2px solid ${selected ? color : runStatus === "running" ? color : needsInput ? "#f59e0b" : "var(--border)"}`,
        boxShadow: selected
          ? `0 0 0 3px ${color}22`
          : runStatus === "running"
          ? `0 0 0 3px ${color}33`
          : needsInput
          ? "0 0 0 3px rgba(245,158,11,0.15)"
          : "0 1px 3px rgba(0,0,0,0.06)",
        transition: "border-color 0.2s, box-shadow 0.2s",
        opacity: runStatus === "idle" ? 1 : 1,
      }}
    >
      {/* Run status badge — top-right corner */}
      {runStatus === "running" && (
        <div className="absolute flex items-center justify-center rounded-full"
          style={{ top: -8, right: -8, width: 20, height: 20, background: "#fff", border: `2px solid ${color}`, boxShadow: "0 1px 4px rgba(0,0,0,0.15)", zIndex: 10 }}>
          <Loader size={10} className="animate-spin" style={{ color }} />
        </div>
      )}
      {runStatus === "done" && (
        <div className="absolute flex items-center justify-center rounded-full"
          style={{ top: -8, right: -8, width: 20, height: 20, background: "#fff", border: "2px solid #22c55e", boxShadow: "0 1px 4px rgba(0,0,0,0.15)", zIndex: 10 }}>
          <CheckCircle size={12} style={{ color: "#22c55e" }} />
        </div>
      )}
      {runStatus === "pending" && (
        <div className="absolute flex items-center justify-center rounded-full"
          style={{ top: -8, right: -8, width: 20, height: 20, background: "#fff", border: "2px solid var(--border)", boxShadow: "0 1px 4px rgba(0,0,0,0.10)", zIndex: 10 }}>
          <Hourglass size={10} style={{ color: "var(--text-muted)" }} />
        </div>
      )}

      {/* Missing-input warning badge — only when not in a run */}
      {needsInput && runStatus === "idle" && (
        <div
          className="absolute flex items-center gap-1 px-1.5 py-0.5 rounded-full text-white"
          style={{
            top: -10, right: -10,
            background: "#f59e0b",
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.02em",
            boxShadow: "0 1px 4px rgba(0,0,0,0.18)",
            zIndex: 10, pointerEvents: "none",
          }}
          title="Prompt required — click node to configure"
        >
          <AlertCircle size={10} strokeWidth={2.5} />
          Input needed
        </div>
      )}

      {/* Inner wrapper clips content to rounded corners without clipping the badge */}
      <div className="rounded-xl overflow-hidden">

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: `${color}15`, borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <AgentIcon size={13} style={{ color: "#111111", flexShrink: 0 }} strokeWidth={1.5} />
          <div className="min-w-0">
            <p className="text-xs font-semibold leading-tight" style={{ color }}>STEP {stepNumber}</p>
            <p className="text-xs font-medium leading-tight truncate" style={{ color: "#1C1A16" }}>{label}</p>
          </div>
        </div>

        {/* Hover: edit + delete — hidden while executing */}
        {hovered && !isExecuting && (
          <div className="flex items-center gap-0.5 shrink-0 ml-1">
            <button
              className="p-1 rounded hover:bg-black/8 transition-colors"
              style={{ color: "var(--text-muted)" }}
              title="Configure"
            >
              <Pencil size={11} />
            </button>
            <button
              className="p-1 rounded hover:bg-red-50 transition-colors"
              style={{ color: "#DC2626" }}
              title="Delete node"
              onClick={handleDelete}
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        {semanticModel && (
          <span
            className="inline-block text-xs px-1.5 py-0.5 rounded mb-1.5"
            style={{ background: "rgba(40,145,218,0.08)", color: "#2891DA", fontSize: "10px" }}
          >
            {semanticModel}
          </span>
        )}
        {/* Running shimmer */}
        {runStatus === "running" ? (
          <div className="flex flex-col gap-1.5">
            <div className="rounded animate-pulse h-2" style={{ background: `${color}25`, width: "85%" }} />
            <div className="rounded animate-pulse h-2" style={{ background: `${color}18`, width: "60%" }} />
          </div>
        ) : prompt ? (
          <p className="text-xs leading-relaxed line-clamp-3" style={{ color: "var(--text-secondary)" }}>
            &ldquo;{prompt}&rdquo;
          </p>
        ) : (
          <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>Click to configure…</p>
        )}
        {runPerSegment && runStatus === "idle" && (
          <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#a78bfa" }}>
            <Activity size={10} />
            <span>Run per segment</span>
          </div>
        )}

        {/* View Report button — only when done */}
        {runStatus === "done" && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewReport?.(); }}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ background: `${color}18`, color, border: `1px solid ${color}40`, cursor: "pointer" }}
          >
            <BarChart2 size={11} />
            View Report
          </button>
        )}
      </div>

      </div>{/* end inner clip wrapper */}

      {/* Top — primary incoming */}
      <Handle type="target" position={Position.Top}    style={{ background: "var(--border)", border: "2px solid #fff", width: 10, height: 10 }} />
      {/* Bottom — primary outgoing */}
      <Handle type="source" position={Position.Bottom} style={{ background: color, border: "2px solid #fff", width: 10, height: 10 }} />
      {/* Left — side source + target (show on hover) */}
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        style={{ background: color, border: "2px solid #fff", width: 8, height: 8, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
      />
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        style={{ background: "var(--border)", border: "2px solid #fff", width: 8, height: 8, top: "calc(50% + 6px)", opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
      />
      {/* Right — side source + target (show on hover) */}
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        style={{ background: color, border: "2px solid #fff", width: 8, height: 8, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
      />
      <Handle
        id="right-target"
        type="target"
        position={Position.Right}
        style={{ background: "var(--border)", border: "2px solid #fff", width: 8, height: 8, top: "calc(50% + 6px)", opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
      />
    </div>
  );
}

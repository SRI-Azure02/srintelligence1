"use client";

import { useState, useCallback, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  BackgroundVariant,
  MarkerType,
  Node,
  Edge,
  Connection,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import AgentNode from "./nodes/AgentNode";
import OutputNode from "./nodes/OutputNode";
import type { RunNodeStatus } from "./nodes/AgentNode";
import { X, Undo2, Redo2, Plus, TrendingUp, Layers, GitFork, GitPullRequestArrow, ChevronDown, Search, FileText, LayoutGrid } from "lucide-react";
import { agentPalette } from "@/lib/mock-data";

const nodeTypes = { agentNode: AgentNode, outputNode: OutputNode };

const PALETTE_ICONS: Record<string, React.FC<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>> = {
  "sri-analyst":    Search,
  "sri-forecast":   TrendingUp,
  "sri-clustering": Layers,
  "sri-mtree":      GitFork,
  "sri-causal":     GitPullRequestArrow,
  "output":         FileText,
};

const PALETTE_COLORS: Record<string, string> = {
  "sri-analyst":    "#2891DA",
  "sri-forecast":   "#34c98b",
  "sri-clustering": "#a78bfa",
  "sri-mtree":      "#fb923c",
  "sri-causal":     "#8b5cf6",
  "output":         "#64748b",
};

// ── Algorithm option lists ────────────────────────────────────────────────────
const FORECAST_ALGORITHMS = [
  { value: "sri-forecast",  label: "Auto (Best Fit)" },
  { value: "prophet",       label: "Prophet" },
  { value: "sarima",        label: "SARIMA" },
  { value: "xgboost",       label: "XGBoost" },
  { value: "holt-winters",  label: "Holt-Winters" },
  { value: "hybrid",        label: "Hybrid" },
];

const CLUSTERING_ALGORITHMS = [
  { value: "sri-clustering", label: "Auto (Best Fit)" },
  { value: "gmm",            label: "Gaussian Mixture (GMM)" },
  { value: "kmeans",         label: "K-Means" },
  { value: "kmedoids",       label: "K-Medoids" },
  { value: "dbscan",         label: "DBSCAN" },
  { value: "hierarchical",   label: "Hierarchical" },
];

const FORECAST_TYPES  = new Set(FORECAST_ALGORITHMS.map((a) => a.value));
const CLUSTER_TYPES   = new Set(CLUSTERING_ALGORITHMS.map((a) => a.value));

function getNodeCategory(agentType: string): "analyst" | "forecast" | "clustering" | "mtree" | "causal" | "other" {
  if (agentType === "sri-analyst")    return "analyst";
  if (FORECAST_TYPES.has(agentType))  return "forecast";
  if (CLUSTER_TYPES.has(agentType))   return "clustering";
  if (agentType === "sri-mtree")      return "mtree";
  if (agentType === "sri-causal")     return "causal";
  return "other";
}

export const edgeDefaults = {
  animated: true,
  style: { stroke: "#1C1A16", strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#1C1A16", width: 16, height: 16 },
};

const DEFAULT_NODES: Node[] = [
  { id: "output", type: "outputNode", position: { x: 180, y: 160 }, data: {} },
];

const DEFAULT_EDGES: Edge[] = [];

// Compute step numbers via topological BFS
function computeStepNumbers(nodes: Node[], edges: Edge[]): Map<string, number> {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const children = new Map<string, string[]>(nodes.map((n) => [n.id, []]));

  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    children.get(e.source)?.push(e.target);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const stepMap = new Map<string, number>();
  let step = 1;
  const visited = new Set<string>();

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.find((n) => n.id === id);
    if (node?.type === "agentNode") {
      stepMap.set(id, step++);
    }
    for (const child of children.get(id) ?? []) {
      const newDeg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, newDeg);
      if (newDeg <= 0) queue.push(child);
    }
  }
  return stepMap;
}

// ── Custom styled dropdown (replaces native <select> for consistent look) ────
interface CustomSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function CustomSelect({ value, onChange, options }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Element)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs outline-none transition-colors"
        style={{
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
        }}
      >
        <span>{label}</span>
        <ChevronDown size={11} style={{ color: "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-1 rounded-lg overflow-hidden"
          style={{
            background: "#ffffff",
            border: "1px solid var(--border)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-black/5"
              style={{
                color: opt.value === value ? "var(--accent)" : "var(--text-primary)",
                background: opt.value === value ? "rgba(40,145,218,0.06)" : "transparent",
                fontWeight: opt.value === value ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SemanticView { id: string; displayName: string; }

interface NodeDetailDrawerProps {
  node: Node;
  onClose: () => void;
  onUpdateNode: (id: string, data: Record<string, unknown>) => void;
  semanticViews: SemanticView[];
  /** Called whenever the drawer's dirty state changes so the canvas can intercept close/switch */
  onDirtyChange: (dirty: boolean) => void;
  /** Ref the canvas fills to trigger a save from outside (e.g. before closing) */
  saveRef: React.MutableRefObject<(() => void) | null>;
}

function NodeDetailDrawer({ node, onClose, onUpdateNode, semanticViews, onDirtyChange, saveRef }: NodeDetailDrawerProps) {
  const d        = node.data as Record<string, unknown>;
  const rawType  = (d.agentType as string) ?? "sri-analyst";
  const category = getNodeCategory(rawType);

  // Prompt
  const [prompt, setPrompt] = useState((d.prompt as string) ?? "");
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Snapshot of values at open-time — used to detect changes
  const initial = useRef({
    prompt:             (d.prompt             as string)  ?? "",
    algorithm:          rawType,
    autoK:              (d.numClusters as number | null) == null || (d.autoK as boolean) === true,
    numClusters:        (d.numClusters        as number)  ?? 3,
    forecastPeriods:    (d.forecastPeriods    as number)  ?? 12,
    forecastGranularity:(d.forecastGranularity as string) ?? "Monthly",
    historyToUse:       (d.historyToUse       as string)  ?? "All available",
    outputFormat:       (d.outputFormat       as string)  ?? "Full Table",
    semanticModelId:    (d.semanticModel      as string)  ?? "",
  });

  // Auto-focus the prompt field when the drawer opens and prompt is missing
  useEffect(() => {
    if (!prompt.trim()) {
      const t = setTimeout(() => promptRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Algorithm (forecast / clustering sub-type)
  const [algorithm, setAlgorithm] = useState(rawType);

  // Clustering params
  const [autoK,       setAutoK]       = useState<boolean>((d.numClusters as number | null) == null || (d.autoK as boolean) === true);
  const [numClusters, setNumClusters] = useState<number>((d.numClusters as number) ?? 3);

  // Forecast params
  const [forecastPeriods,     setForecastPeriods]     = useState<number>((d.forecastPeriods as number) ?? 12);
  const [forecastGranularity, setForecastGranularity] = useState((d.forecastGranularity as string) ?? "Monthly");
  const [historyToUse,        setHistoryToUse]        = useState((d.historyToUse as string) ?? "All available");

  // Shared params
  const [outputFormat,    setOutputFormat]    = useState((d.outputFormat as string) ?? "Full Table");
  const [semanticModelId, setSemanticModelId] = useState((d.semanticModel as string) ?? "");

  // Whether "Number of clusters" applies to the chosen algorithm
  const clusterNeedsK = ["kmeans", "kmedoids", "gmm", "sri-clustering"].includes(algorithm);

  const promptMissing = !prompt.trim();

  // Dirty check — true when any field differs from its value at open-time
  const isDirty =
    prompt             !== initial.current.prompt             ||
    algorithm          !== initial.current.algorithm          ||
    autoK              !== initial.current.autoK              ||
    numClusters        !== initial.current.numClusters        ||
    forecastPeriods    !== initial.current.forecastPeriods    ||
    forecastGranularity!== initial.current.forecastGranularity||
    historyToUse       !== initial.current.historyToUse       ||
    outputFormat       !== initial.current.outputFormat       ||
    semanticModelId    !== initial.current.semanticModelId;

  const handleApply = () => {
    if (!isDirty) return;
    onUpdateNode(node.id, {
      ...d,
      prompt,
      agentType: algorithm,
      outputFormat,
      semanticModel: semanticModelId,
      ...(category === "clustering" && clusterNeedsK ? { autoK, numClusters: autoK ? null : numClusters } : {}),
      ...(category === "forecast" ? { forecastPeriods, forecastGranularity, historyToUse } : {}),
    });
    // Update snapshot so the button disables again after saving
    initial.current = { prompt, algorithm, autoK, numClusters, forecastPeriods, forecastGranularity, historyToUse, outputFormat, semanticModelId };
  };

  // Keep parent informed of dirty state and expose handleApply
  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => { saveRef.current = handleApply; });

  // Ctrl+S to apply changes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleApply();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  // handleApply is stable within a render; re-register when dirty state changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, prompt, algorithm, autoK, numClusters, forecastPeriods, forecastGranularity, historyToUse, outputFormat, semanticModelId]);

  const inputStyle = { background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-primary)" };

  return (
    <div className="h-full flex flex-col overflow-y-auto" style={{ background: "var(--bg-secondary)", borderLeft: "1px solid var(--border)", width: 270 }}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{d.label as string}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-black/7 transition-colors" style={{ color: "var(--text-muted)" }}>
          <X size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4 flex-1">
        {/* Prompt */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium" style={{ color: promptMissing ? "#f59e0b" : "var(--text-muted)" }}>
              {category === "analyst" ? "Query / Prompt" : "Prompt"}
            </label>
            {promptMissing && (
              <span className="text-xs font-medium" style={{ color: "#f59e0b" }}>Required</span>
            )}
          </div>
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={
              category === "analyst"    ? "e.g. List physicians with over 100 brand1 claims…" :
              category === "forecast"   ? "e.g. Forecast brand1 claims by territory…" :
              category === "clustering" ? "e.g. Segment physicians by prescribing behaviour…" :
              category === "mtree"      ? "e.g. Analyse key drivers of brand1 performance…" :
              category === "causal"     ? "e.g. Identify causal factors driving brand1 share…" :
              "Describe what this step should do…"
            }
            className="w-full rounded-lg px-3 py-2 text-xs resize-none outline-none"
            style={{
              ...inputStyle,
              fontFamily: "inherit",
              border: promptMissing ? "1.5px solid #f59e0b" : "1px solid var(--border)",
              boxShadow: promptMissing ? "0 0 0 3px rgba(245,158,11,0.12)" : "none",
            }}
          />
          {promptMissing && (
            <p className="text-xs mt-1" style={{ color: "#f59e0b" }}>
              Describe what this step should do to run the workflow.
            </p>
          )}
        </div>

        {/* ── Forecast fields ───────────────────────────────────────────── */}
        {category === "forecast" && (<>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-muted)" }}>Algorithm</label>
            <CustomSelect value={algorithm} onChange={setAlgorithm} options={FORECAST_ALGORITHMS} />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-muted)" }}>Forecast Periods</label>
              <input
                type="number"
                min={1}
                max={120}
                value={forecastPeriods}
                onChange={(e) => setForecastPeriods(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                style={inputStyle}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-muted)" }}>Granularity</label>
              <CustomSelect
                value={forecastGranularity}
                onChange={setForecastGranularity}
                options={["Weekly","Monthly","Quarterly"].map((v) => ({ value: v, label: v }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-muted)" }}>History to Use</label>
            <CustomSelect
              value={historyToUse}
              onChange={setHistoryToUse}
              options={["All available","1 year","2 years","3 years","5 years"].map((v) => ({ value: v, label: v }))}
            />
          </div>
        </>)}

        {/* ── Clustering fields ─────────────────────────────────────────── */}
        {category === "clustering" && (<>
          <div>
            <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-muted)" }}>Algorithm</label>
            <CustomSelect value={algorithm} onChange={setAlgorithm} options={CLUSTERING_ALGORITHMS} />
          </div>

          {clusterNeedsK && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Number of Clusters</label>
                {/* Auto-K toggle */}
                <button
                  type="button"
                  onClick={() => setAutoK((v) => !v)}
                  className="flex items-center gap-1.5 text-xs transition-colors"
                  style={{ color: autoK ? "var(--accent)" : "var(--text-muted)" }}
                >
                  <span
                    className="relative inline-flex items-center rounded-full shrink-0 transition-colors"
                    style={{ width: 28, height: 16, background: autoK ? "#2891DA" : "var(--border)" }}
                  >
                    <span
                      className="absolute rounded-full bg-white shadow transition-transform"
                      style={{ width: 11, height: 11, left: 2, transform: autoK ? "translateX(12px)" : "translateX(0)" }}
                    />
                  </span>
                  Auto‑K
                </button>
              </div>

              {autoK ? (
                <p className="text-xs py-2 px-3 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
                  The algorithm will determine the optimal number of clusters automatically.
                </p>
              ) : (
                <>
                  <input
                    type="number"
                    min={2}
                    max={20}
                    value={numClusters}
                    onChange={(e) => setNumClusters(Math.max(2, Math.min(20, Number(e.target.value))))}
                    className="w-full rounded-lg px-3 py-2 text-xs outline-none"
                    style={inputStyle}
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Fixed at k = {numClusters}. Range: 2 – 20.
                  </p>
                </>
              )}
            </div>
          )}
        </>)}

        {/* Semantic Model — real models from Snowflake */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-muted)" }}>Semantic Model</label>
          {semanticViews.length === 0 ? (
            <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
              Loading…
            </p>
          ) : (
            <CustomSelect
              value={semanticModelId || semanticViews[0].id}
              onChange={setSemanticModelId}
              options={semanticViews.map((v) => ({ value: v.id, label: v.displayName }))}
            />
          )}
        </div>

        {/* Output Format */}
        <div>
          <label className="text-xs font-medium block mb-1.5" style={{ color: "var(--text-muted)" }}>Output Format</label>
          <CustomSelect
            value={outputFormat}
            onChange={setOutputFormat}
            options={["Full Table","Summary Only","Chart","Narrative"].map((v) => ({ value: v, label: v }))}
          />
        </div>

        {/* Input source info */}
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-muted)" }}>Input</label>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {node.id === "step-0" ? "None (first step)" : "From upstream step output"}
          </p>
        </div>

        <div className="rounded-lg p-3 text-xs flex flex-col gap-1" style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>
          <p className="font-medium" style={{ color: "var(--text-muted)" }}>Last Run Result</p>
          <p style={{ color: "var(--success)" }}>Success (1.4s)</p>
          <p style={{ color: "var(--text-secondary)" }}>Rows returned: 12</p>
        </div>
      </div>

      <div className="p-4 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={handleApply}
          disabled={!isDirty}
          className="w-full py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{
            background:  isDirty ? "var(--accent)"      : "var(--bg-tertiary)",
            color:       isDirty ? "#ffffff"             : "var(--text-muted)",
            border:      isDirty ? "none"                : "1px solid var(--border)",
            cursor:      isDirty ? "pointer"             : "not-allowed",
            opacity:     isDirty ? 1                     : 0.7,
          }}
        >
          Apply Changes
        </button>
      </div>
    </div>
  );
}

// ── Discard-changes confirmation dialog ──────────────────────────────────────
function DiscardDialog({
  onSave,
  onDiscard,
  onCancel,
}: {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="rounded-xl p-5 shadow-2xl flex flex-col gap-4"
        style={{ background: "#ffffff", border: "1px solid var(--border)", width: 320 }}
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Unsaved changes</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            You have unsaved changes on this node. Save them before leaving, or discard?
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-black/5"
            style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={onDiscard}
            className="px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-red-50"
            style={{ border: "1px solid #fca5a5", color: "#DC2626" }}
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
            style={{ background: "var(--accent)", color: "white" }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Auto-layout: picks vertical / horizontal / diagonal to minimise whitespace ─
//
// Strategy selection works by estimating the bounding-box aspect ratio (AR) each
// strategy would produce and comparing it to a target landscape AR (16:9).
// Scoring is biased against portrait outputs (canvas is wider than tall).
//
//  • Vertical   — layers stack top→bottom; parallel nodes spread left→right
//  • Horizontal — layers run left→right; parallel nodes stack top→bottom
//  • Diagonal   — layers advance right AND down; parallel nodes stack vertically
//    The diagonal Y-step is chosen so a single linear chain lands exactly on the
//    target AR — both dimensions grow together, leaving minimal empty space.
//
function autoLayout(nodes: Node[], edges: Edge[]): Node[] {
  const NODE_W    = 200;
  const NODE_H    = 90;
  const H_GAP     = 70;
  const V_GAP     = 60;
  const LAYER_X   = NODE_W + H_GAP;   // x-step per layer: 270 px
  const LAYER_Y   = NODE_H + V_GAP;   // y-step per layer: 150 px
  const TARGET_AR = 16 / 9;           // ≈1.778 — assumed landscape canvas

  // ── BFS: assign longest-path depth (layer) to every node ─────────────────
  const childMap  = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const parentMap = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    childMap.get(e.source)?.push(e.target);
    parentMap.get(e.target)?.push(e.source);
  }

  const layerMap = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const queue    = nodes.filter((n) => (parentMap.get(n.id)?.length ?? 0) === 0).map((n) => n.id);
  const visited  = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const l = layerMap.get(id) ?? 0;
    for (const child of childMap.get(id) ?? []) {
      layerMap.set(child, Math.max(layerMap.get(child) ?? 0, l + 1));
      queue.push(child);
    }
  }

  const byLayer = new Map<number, string[]>();
  nodes.forEach((n) => {
    const l = layerMap.get(n.id) ?? 0;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(n.id);
  });

  const numLayers   = byLayer.size || 1;
  const maxPerLayer = byLayer.size
    ? Math.max(...Array.from(byLayer.values()).map((ids) => ids.length))
    : 1;

  // ── Score each strategy (lower = better fit to TARGET_AR) ────────────────
  // Landscape bias: portrait outputs are penalised 1.4× more than wide ones
  const scoreFn = (ar: number) => {
    const r = ar / TARGET_AR;
    return r < 1 ? Math.log(1 / r) * 1.4 : Math.log(r);
  };

  const ar_v = (maxPerLayer * LAYER_X) / Math.max(numLayers   * LAYER_Y, 1);
  const ar_h = (numLayers   * LAYER_X) / Math.max(maxPerLayer * LAYER_Y, 1);

  // Diagonal: dy per layer chosen so a chain of N nodes hits TARGET_AR exactly.
  // Extra parallel nodes in the same layer stack vertically and add to height.
  const diagDY = LAYER_X / TARGET_AR;           // ≈151 px/layer
  const diag_W = numLayers * LAYER_X + NODE_W;
  const diag_H = numLayers > 1
    ? numLayers * diagDY + Math.max(0, maxPerLayer - 1) * LAYER_Y
    : maxPerLayer * LAYER_Y;
  const ar_d = diag_W / Math.max(diag_H, 1);

  const score_v = scoreFn(ar_v);
  const score_h = scoreFn(ar_h);
  const score_d = scoreFn(ar_d);
  const best    = Math.min(score_v, score_h, score_d);

  const posMap = new Map<string, { x: number; y: number }>();

  if (best === score_d) {
    // ── Diagonal ──────────────────────────────────────────────────────────
    // Each successive layer steps right (LAYER_X) and down (diagDY).
    // Multiple nodes in the same layer stack vertically, centred on that point.
    byLayer.forEach((ids, layer) => {
      const stackH = ids.length * LAYER_Y - V_GAP;
      ids.forEach((id, i) => {
        posMap.set(id, {
          x: 80  + layer * LAYER_X,
          y: 60  + layer * diagDY + i * LAYER_Y - stackH / 2,
        });
      });
    });

  } else if (best === score_h) {
    // ── Horizontal ────────────────────────────────────────────────────────
    // Layers run left→right; parallel nodes within a layer stack vertically.
    byLayer.forEach((ids, layer) => {
      const stackH = ids.length * LAYER_Y - V_GAP;
      ids.forEach((id, i) => {
        posMap.set(id, {
          x: 60  + layer * LAYER_X,
          y: 200 + i * LAYER_Y - stackH / 2,
        });
      });
    });

  } else {
    // ── Vertical ──────────────────────────────────────────────────────────
    // Layers stack top→bottom; parallel nodes within a layer spread left→right.
    byLayer.forEach((ids, layer) => {
      const spreadW = ids.length * LAYER_X - H_GAP;
      ids.forEach((id, i) => {
        posMap.set(id, {
          x: i * LAYER_X - spreadW / 2 + 400,
          y: 60 + layer * LAYER_Y,
        });
      });
    });
  }

  return nodes.map((n) => ({ ...n, position: posMap.get(n.id) ?? n.position }));
}

// ── Inner helper: calls fitView after auto-layout signal fires ────────────────
function FitViewHelper({ signal }: { signal: number }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (signal > 0) {
      // Small delay to let React commit the new node positions first
      const t = setTimeout(() => fitView({ duration: 350, padding: 0.25 }), 60);
      return () => clearTimeout(t);
    }
  }, [signal, fitView]);
  return null;
}

// ── Topological order helper (used by run simulation) ────────────────────────
function getTopologicalOrder(nodes: Node[], edges: Edge[]): string[] {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const children = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    children.get(e.source)?.push(e.target);
  }
  const queue   = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const result: string[] = [];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(id);
    for (const child of children.get(id) ?? []) {
      const deg = (inDegree.get(child) ?? 1) - 1;
      inDegree.set(child, deg);
      if (deg <= 0) queue.push(child);
    }
  }
  return result;
}

// ── Public handle exposed via forwardRef ────────────────────────────────────
export interface WorkflowCanvasHandle {
  getOrderedNodeIds: () => string[];
}

// Edge tooltip state
interface EdgeTooltip { x: number; y: number; edgeId: string }

const MAX_HISTORY = 5;

const WorkflowCanvas = forwardRef<WorkflowCanvasHandle, {
  startEmpty?: boolean;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  toolbarOffset?: number;
  runNodeStates?: Record<string, RunNodeStatus>;
  onViewReport?: (nodeId: string, agentType: string, label: string) => void;
}>(function WorkflowCanvas({
  startEmpty = false,
  initialNodes,
  initialEdges,
  toolbarOffset = 12,
  runNodeStates,
  onViewReport,
}, ref) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodes ?? (startEmpty ? [] : DEFAULT_NODES)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges ?? (startEmpty ? [] : DEFAULT_EDGES)
  );
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltip | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [semanticViews, setSemanticViews] = useState<SemanticView[]>([]);

  // Dirty-drawer intercept
  const drawerIsDirtyRef = useRef(false);
  const drawerSaveRef    = useRef<(() => void) | null>(null);
  type PendingAction = { type: "close" } | { type: "switch"; nextNode: Node };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Fetch real semantic models from Snowflake on mount
  useEffect(() => {
    fetch("/api/semantic-views")
      .then((r) => r.json())
      .then((data: { views?: { id: string; displayName: string }[] }) => {
        if (Array.isArray(data.views)) {
          setSemanticViews(data.views.map((v) => ({ id: v.id, displayName: v.displayName })));
        }
      })
      .catch(() => { /* non-critical — drawer shows "Loading…" until resolved */ });
  }, []);

  // Undo/redo history
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [future, setFuture] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // Expose ordered node IDs for run simulation in parent
  useImperativeHandle(ref, () => ({
    getOrderedNodeIds: () => getTopologicalOrder(nodesRef.current, edgesRef.current),
  }), []);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { nodes: nodesRef.current, edges: edgesRef.current }]);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [{ nodes: nodesRef.current, edges: edgesRef.current }, ...f.slice(0, MAX_HISTORY - 1)]);
      setNodes(prev.nodes);
      setEdges(prev.edges);
      return h.slice(0, -1);
    });
  }, [setNodes, setEdges]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setHistory((h) => [...h.slice(-(MAX_HISTORY - 1)), { nodes: nodesRef.current, edges: edgesRef.current }]);
      setNodes(next.nodes);
      setEdges(next.edges);
      return f.slice(1);
    });
  }, [setNodes, setEdges]);

  // Intercept node changes to capture deletions for history
  const onNodesChangeWrapped = useCallback((changes: NodeChange[]) => {
    if (changes.some((c) => c.type === "remove")) {
      pushHistory();
    }
    onNodesChange(changes);
  }, [onNodesChange, pushHistory]);

  // Intercept edge changes to capture deletions for history
  const onEdgesChangeWrapped = useCallback((changes: EdgeChange[]) => {
    if (changes.some((c) => c.type === "remove")) {
      pushHistory();
    }
    onEdgesChange(changes);
  }, [onEdgesChange, pushHistory]);

  // Stable ref for onViewReport so node callbacks don't go stale
  const onViewReportRef = useRef(onViewReport);
  onViewReportRef.current = onViewReport;

  // Compute step numbers from topology and inject run status
  const nodesWithSteps = useMemo(() => {
    const stepMap = computeStepNumbers(nodes, edges);
    return nodes.map((n) => {
      const runStatus = runNodeStates?.[n.id] ?? "idle";
      const viewReportCb = onViewReportRef.current
        ? () => onViewReportRef.current?.(
            n.id,
            (n.data.agentType as string) ?? n.type ?? "output",
            (n.data.label as string) ?? "Output",
          )
        : undefined;
      if (n.type === "agentNode") {
        return { ...n, data: { ...n.data, stepNumber: stepMap.get(n.id) ?? (n.data.stepNumber as number), runStatus, onViewReport: viewReportCb } };
      }
      if (n.type === "outputNode") {
        return { ...n, data: { ...n.data, runStatus, onViewReport: viewReportCb } };
      }
      return n;
    });
  }, [nodes, edges, runNodeStates]);

  const onConnect = useCallback(
    (params: Connection) => {
      pushHistory();
      setEdges((eds) => addEdge({ ...params, ...edgeDefaults }, eds));
    },
    [setEdges, pushHistory]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== "agentNode") return;
    if (selectedNode && drawerIsDirtyRef.current && node.id !== selectedNode.id) {
      setPendingAction({ type: "switch", nextNode: node });
    } else {
      setSelectedNode(node);
    }
  }, [selectedNode]);

  const onPaneClick = useCallback(() => {
    setEdgeTooltip(null);
    setShowPalette(false);
    if (selectedNode && drawerIsDirtyRef.current) {
      setPendingAction({ type: "close" });
    } else {
      setSelectedNode(null);
    }
  }, [selectedNode]);

  // Double-click edge to delete
  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    pushHistory();
    setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    setEdgeTooltip(null);
  }, [setEdges, pushHistory]);

  // Edge hover tooltip
  const onEdgeMouseEnter = useCallback((event: React.MouseEvent, edge: Edge) => {
    setEdgeTooltip({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  const onEdgeMouseLeave = useCallback(() => setEdgeTooltip(null), []);

  // Keyboard delete + undo/redo
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        pushHistory();
        setNodes((nds) => nds.filter((n) => !n.selected));
        setEdges((eds) => eds.filter((ed) => !ed.selected));
        setSelectedNode(null);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [setNodes, setEdges, pushHistory, undo, redo]);

  const updateNodeData = useCallback((id: string, data: Record<string, unknown>) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data } : n)));
    // Update selected node to reflect new data
    setSelectedNode((prev) => prev && prev.id === id ? { ...prev, data } : prev);
  }, [setNodes]);

  const addNode = useCallback((agentType: string, label: string) => {
    pushHistory();
    const id = agentType === "output" ? `output-${Date.now()}` : `node-${Date.now()}`;
    const isOutput = agentType === "output";

    // Place new node to the right of the last non-output node, or at a default position
    const agentNodes = nodesRef.current.filter((n) => n.type === "agentNode");
    const allNodes   = nodesRef.current;
    const last = isOutput
      ? allNodes[allNodes.length - 1]           // place after everything
      : agentNodes[agentNodes.length - 1];       // place after last agent node
    const position = last
      ? { x: last.position.x + 260, y: last.position.y }
      : { x: 100, y: 200 };

    setNodes((nds) => [
      ...nds,
      isOutput
        ? { id, type: "outputNode" as const, position, data: {} }
        : { id, type: "agentNode" as const, position, data: { agentType, label, prompt: "", stepNumber: agentNodes.length + 1 } },
    ]);
  }, [setNodes, pushHistory]);

  const [fitViewSignal, setFitViewSignal] = useState(0);

  const handleOrganize = useCallback(() => {
    pushHistory();
    setNodes((nds) => autoLayout(nds, edgesRef.current));
    setFitViewSignal((s) => s + 1);
  }, [pushHistory, setNodes]);

  const executePending = useCallback((save: boolean) => {
    const action = pendingAction;
    setPendingAction(null);
    if (save) drawerSaveRef.current?.();
    if (action?.type === "close") {
      setSelectedNode(null);
    } else if (action?.type === "switch") {
      setSelectedNode(action.nextNode);
    }
  }, [pendingAction]);

  return (
    <div className="flex h-full relative">
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodesWithSteps}
          edges={edges}
          onNodesChange={onNodesChangeWrapped}
          onEdgesChange={onEdgesChangeWrapped}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgeMouseEnter={onEdgeMouseEnter}
          onEdgeMouseLeave={onEdgeMouseLeave}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          defaultEdgeOptions={edgeDefaults}
          deleteKeyCode={null}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border)" />
          <Controls>
            <ControlButton onClick={handleOrganize} title="Auto-arrange nodes">
              <LayoutGrid size={12} />
            </ControlButton>
          </Controls>
          <FitViewHelper signal={fitViewSignal} />
        </ReactFlow>

        {/* Toolbar: Undo / Redo + Add Step */}
        <div className="absolute top-3 z-10 flex items-center gap-1" style={{ left: toolbarOffset }}>
          {/* Vertical divider separating version bar from this toolbar */}
          <div style={{ width: 1, height: 22, background: "var(--border)", marginLeft: -10, marginRight: 6, flexShrink: 0 }} />
          <button
            onClick={undo}
            disabled={!history.length}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: "#ffffff", border: "1px solid var(--border)", color: "var(--text-secondary)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
            title="Undo (⌘Z)"
          >
            <Undo2 size={12} /> Undo
          </button>
          <button
            onClick={redo}
            disabled={!future.length}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors hover:bg-black/5 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: "#ffffff", border: "1px solid var(--border)", color: "var(--text-secondary)", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
            title="Redo (⌘⇧Z)"
          >
            <Redo2 size={12} /> Redo
          </button>

          {/* Divider */}
          <div style={{ width: 1, height: 20, background: "var(--border)", margin: "0 4px" }} />

          {/* Add Step button + dropdown palette */}
          <div className="relative">
            <button
              onClick={() => setShowPalette((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors hover:opacity-90"
              style={{ background: "#2891DA", color: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.10)" }}
            >
              <Plus size={12} />
              Add Step
              <ChevronDown size={11} style={{ opacity: 0.8 }} />
            </button>

            {showPalette && (
              <div
                className="absolute top-full left-0 mt-1 rounded-xl shadow-xl overflow-hidden"
                style={{ background: "#ffffff", border: "1px solid var(--border)", width: 230, zIndex: 50 }}
              >
                <p className="text-xs font-semibold px-3 pt-2.5 pb-1.5" style={{ color: "var(--text-muted)" }}>
                  Choose agent type
                </p>
                {agentPalette.map((agent) => {
                  const Icon = PALETTE_ICONS[agent.type] ?? TrendingUp;
                  const color = PALETTE_COLORS[agent.type] ?? "#4f8ef7";
                  return (
                    <button
                      key={agent.type}
                      onClick={() => {
                        addNode(agent.type, agent.label);
                        setShowPalette(false);
                      }}
                      className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-black/4"
                    >
                      <span
                        className="flex items-center justify-center rounded-lg shrink-0 mt-0.5"
                        style={{ width: 28, height: 28, background: `${color}18` }}
                      >
                        <Icon size={14} strokeWidth={1.5} style={{ color }} />
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{agent.label}</span>
                        <span className="text-xs leading-tight" style={{ color: "var(--text-muted)" }}>{agent.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Edge hover tooltip */}
        {edgeTooltip && (
          <div
            className="fixed z-50 pointer-events-none px-2 py-1 rounded text-xs shadow-md"
            style={{ left: edgeTooltip.x + 12, top: edgeTooltip.y - 28, background: "#1C1A16", color: "#fff" }}
          >
            Double-click to delete
          </div>
        )}
      </div>

      {selectedNode && (
        <NodeDetailDrawer
          key={selectedNode.id}
          node={selectedNode}
          onClose={() => {
            if (drawerIsDirtyRef.current) {
              setPendingAction({ type: "close" });
            } else {
              setSelectedNode(null);
            }
          }}
          onUpdateNode={updateNodeData}
          semanticViews={semanticViews}
          onDirtyChange={(dirty) => { drawerIsDirtyRef.current = dirty; }}
          saveRef={drawerSaveRef}
        />
      )}

      {pendingAction && (
        <DiscardDialog
          onSave={() => executePending(true)}
          onDiscard={() => executePending(false)}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
});

export default WorkflowCanvas;
export type { Node };

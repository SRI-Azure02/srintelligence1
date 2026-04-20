"use client";

import { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MoreHorizontal, FileText, Loader, CheckCircle, Hourglass, BarChart2 } from "lucide-react";
import type { RunNodeStatus } from "./AgentNode";

export default function OutputNode({ id, data, selected }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  void hovered; // used for future hover actions

  const runStatus    = (data.runStatus    as RunNodeStatus) ?? "idle";
  const onViewReport = data.onViewReport  as (() => void)   | undefined;
  const color        = "#64748b";

  return (
    <div
      className="relative rounded-xl overflow-visible"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 200,
        background: "#ffffff",
        border: `2px solid ${selected ? color : runStatus === "running" ? color : "var(--border)"}`,
        boxShadow: selected
          ? "0 0 0 3px rgba(100,116,139,0.2)"
          : runStatus === "running"
          ? "0 0 0 3px rgba(100,116,139,0.25)"
          : "none",
        transition: "border-color 0.2s, box-shadow 0.2s",
      }}
    >
      {/* Run status badge */}
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

      {/* Inner clip wrapper */}
      <div className="rounded-xl overflow-hidden">
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "rgba(100,116,139,0.12)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1.5">
          <FileText size={13} style={{ color: "#111111" }} strokeWidth={1.5} />
          <div>
            <p className="text-xs font-semibold leading-tight" style={{ color }}>
              OUTPUT
            </p>
            <p className="text-xs font-medium leading-tight" style={{ color: "#1C1A16" }}>
              Combined Report
            </p>
          </div>
        </div>
        {runStatus === "idle" && (
          <button
            className="p-1 rounded hover:bg-black/7 transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            <MoreHorizontal size={13} />
          </button>
        )}
      </div>
      <div className="px-3 py-2.5">
        {runStatus === "running" ? (
          <div className="flex flex-col gap-1.5">
            <div className="rounded animate-pulse h-2" style={{ background: "rgba(100,116,139,0.2)", width: "80%" }} />
            <div className="rounded animate-pulse h-2" style={{ background: "rgba(100,116,139,0.12)", width: "55%" }} />
          </div>
        ) : (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Render: Table + Forecast Charts per Segment
          </p>
        )}
        {runStatus === "done" && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewReport?.(); }}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ background: "rgba(100,116,139,0.12)", color, border: "1px solid rgba(100,116,139,0.3)", cursor: "pointer" }}
          >
            <BarChart2 size={11} />
            View Report
          </button>
        )}
      </div>
      </div>{/* end inner clip */}
      {/* Top — primary incoming */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "var(--border)", border: "2px solid #ffffff", width: 10, height: 10 }}
      />
      {/* Left side handles (show on hover) */}
      <Handle
        id="left-source"
        type="source"
        position={Position.Left}
        style={{ background: "#64748b", border: "2px solid #fff", width: 8, height: 8, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
      />
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        style={{ background: "var(--border)", border: "2px solid #fff", width: 8, height: 8, top: "calc(50% + 6px)", opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
      />
      {/* Right side handles (show on hover) */}
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        style={{ background: "#64748b", border: "2px solid #fff", width: 8, height: 8, opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}
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

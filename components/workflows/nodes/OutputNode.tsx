"use client";

import { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MoreHorizontal, FileText, Hourglass, BarChart2 } from "lucide-react";
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
        width: 210,
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
          style={{ top: -8, right: -8, width: 20, height: 20, background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.15)", zIndex: 10 }}>
          <span className="animate-spin" style={{
            display: "block", width: 16, height: 16, borderRadius: "50%",
            border: "2.5px solid", borderColor: `${color}28`, borderTopColor: color,
          }} />
        </div>
      )}
      {runStatus === "done" && (
        <div className="absolute flex items-center justify-center rounded-full"
          style={{ top: -8, right: -8, width: 20, height: 20, background: "#22c55e", boxShadow: "0 2px 6px rgba(34,197,94,0.45)", zIndex: 10 }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M2.5 5.5L4.5 7.5L8.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
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
      {/* Body — same fixed height as AgentNode */}
      <div className="relative px-3 py-2.5" style={{ height: 80, overflow: "hidden" }}>
        {runStatus === "running" && (
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="rounded animate-pulse h-2" style={{ background: "rgba(100,116,139,0.2)", width: "80%" }} />
            <div className="rounded animate-pulse h-2" style={{ background: "rgba(100,116,139,0.12)", width: "55%" }} />
          </div>
        )}
        {runStatus !== "running" && runStatus !== "done" && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Render: Table + Forecast Charts per Segment
          </p>
        )}
        {runStatus === "done" && (
          <button
            onClick={(e) => { e.stopPropagation(); onViewReport?.(); }}
            className="absolute inset-0 flex items-center justify-center gap-3 transition-colors"
            style={{ background: `${color}07`, cursor: "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `${color}12`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = `${color}07`; }}
          >
            <span style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 32, height: 32, borderRadius: 9, flexShrink: 0,
              background: `${color}22`, border: `1px solid ${color}35`,
            }}>
              <BarChart2 size={14} style={{ color }} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color, letterSpacing: "0.01em" }}>View Results</span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Open combined report</span>
            </span>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ color, opacity: 0.5, flexShrink: 0 }}>
              <path d="M2.5 6.5h8M7 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
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

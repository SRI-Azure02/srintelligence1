"use client";

import { useState } from "react";
import { Handle, Position, NodeProps } from "@xyflow/react";
import { MoreHorizontal, FileText } from "lucide-react";

export default function OutputNode({ selected }: NodeProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="relative rounded-xl overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 200,
        background: "#ffffff",
        border: `2px solid ${selected ? "#64748b" : "var(--border)"}`,
        boxShadow: selected ? "0 0 0 3px rgba(100,116,139,0.2)" : "none",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ background: "rgba(100,116,139,0.12)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-1.5">
          <FileText size={13} style={{ color: "#111111" }} strokeWidth={1.5} />
          <div>
            <p className="text-xs font-semibold leading-tight" style={{ color: "#64748b" }}>
              OUTPUT
            </p>
            <p className="text-xs font-medium leading-tight" style={{ color: "#1C1A16" }}>
              Combined Report
            </p>
          </div>
        </div>
        <button
          className="p-1 rounded hover:bg-black/7 transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <MoreHorizontal size={13} />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Render: Table + Forecast Charts per Segment
        </p>
      </div>
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

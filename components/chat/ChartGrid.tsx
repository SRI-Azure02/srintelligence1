"use client";

import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import { Maximize2 } from "lucide-react";
import { TableData } from "@/lib/types";
import FullscreenOverlay from "@/components/ui/FullscreenOverlay";

// ── Brand palette ─────────────────────────────────────────────────────────────

const SRI = { ink: "#1A3358", accent: "#E26B2C", green: "#16a34a" };
const SERIES_COLORS = [SRI.ink, SRI.accent, "#34c98b", "#8b5cf6"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `${(v / 1_000).toFixed(1)}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function toLabel(col: string): string {
  return col
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bYoy\b/g, "YoY")
    .replace(/\bRx\b/gi, "Rx")
    .replace(/\bYtd\b/g, "YTD");
}

function isNumericCol(rows: (string | number)[][], i: number): boolean {
  const vals = rows.slice(0, 10).map(r => r[i]).filter(v => v != null && v !== "");
  return vals.length > 0 && vals.every(v => !isNaN(Number(v)));
}

function isDateLike(val: unknown): boolean {
  return /\d{4}|\bjan\b|\bfeb\b|\bmar\b|\bapr\b|\bmay\b|\bjun\b|\bjul\b|\baug\b|\bsep\b|\boct\b|\bnov\b|\bdec\b|\bq[1-4]\b/i.test(String(val ?? ""));
}

function hasMixedSign(records: Record<string, string | number>[], key: string): boolean {
  const vals = records.map(r => Number(r[key])).filter(v => !isNaN(v));
  return vals.some(v => v < 0) && vals.some(v => v > 0);
}

// ── Chart spec types ──────────────────────────────────────────────────────────

type ChartType = "line" | "multi-line" | "bar" | "bar-delta";

interface ChartSpec {
  title: string;
  type: ChartType;
  xKey: string;
  yKeys: string[];
  data: Record<string, string | number>[];
}

// ── Core intelligence: analyze table → chart specs ────────────────────────────

export function determineCharts(tableData: TableData): ChartSpec[] {
  const { headers, rows } = tableData;
  if (!rows.length || !headers.length) return [];

  const records: Record<string, string | number>[] = rows.map(row =>
    Object.fromEntries(headers.map((h, i) => [h, row[i]]))
  );

  // Find x-axis column: prefer a date-like non-numeric column
  const numericFlags = headers.map((_, i) => isNumericCol(rows, i));
  let xIdx = headers.findIndex((_, i) => !numericFlags[i] && isDateLike(rows[0]?.[i]));
  if (xIdx === -1) xIdx = headers.findIndex((_, i) => !numericFlags[i]);
  if (xIdx === -1) return [];

  const xKey = headers[xIdx];
  const numCols = headers.filter((_, i) => i !== xIdx && numericFlags[i]);
  if (!numCols.length) return [];

  // Exclude ID-like columns — never plot keys, codes, or identifiers
  const isIdCol = (h: string) => /\b(key|id|npi|code|num|number|zip|fips|dea)\b/i.test(h);

  // Classify: change/pct columns vs volume/value columns
  const isDelta = (h: string) => /pct|percent|change|delta|yoy|growth|rate|diff|%/i.test(h);
  const deltaCols  = numCols.filter(h => !isIdCol(h) && isDelta(h));
  const volumeCols = numCols.filter(h => !isIdCol(h) && !isDelta(h));

  const temporal = rows.length > 3 && isDateLike(rows[0]?.[xIdx]);
  const specs: ChartSpec[] = [];

  // Chart 1 — Volume / value trend
  if (volumeCols.length >= 2) {
    const shortNames = volumeCols.map(c =>
      c.replace(/rx|volume|count|total|filled|claims/gi, "").replace(/_/g, " ").trim() || c
    );
    specs.push({
      title: shortNames.join(" vs "),
      type: temporal ? "multi-line" : "bar",
      xKey,
      yKeys: volumeCols,
      data: records,
    });
  } else if (volumeCols.length === 1) {
    specs.push({
      title: toLabel(volumeCols[0]),
      type: temporal ? "line" : "bar",  // categorical → always bar
      xKey,
      yKeys: volumeCols,
      data: records,
    });
  }

  // Chart 2 — Delta / % change (diverging bar if mixed sign)
  if (deltaCols.length > 0) {
    const mixed = deltaCols.some(c => hasMixedSign(records, c));
    specs.push({
      title: deltaCols.length === 1 ? toLabel(deltaCols[0]) : "Changes & Rates",
      type: mixed ? "bar-delta" : "bar",
      xKey,
      yKeys: [deltaCols[0]],   // one diverging chart per delta col for clarity
      data: records,
    });
    // If multiple delta cols, one more chart
    if (deltaCols.length > 1) {
      specs.push({
        title: toLabel(deltaCols[1]),
        type: hasMixedSign(records, deltaCols[1]) ? "bar-delta" : "bar",
        xKey,
        yKeys: [deltaCols[1]],
        data: records,
      });
    }
  }

  return specs.slice(0, 3);
}

// ── Chart bodies ──────────────────────────────────────────────────────────────

function SingleLine({ spec, height }: { spec: ChartSpec; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={spec.data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={spec.xKey} tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={52} />
        <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [fmt(Number(v))]} />
        <Line type="monotone" dataKey={spec.yKeys[0]} stroke={SRI.ink} strokeWidth={2} dot={spec.data.length <= 24} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MultiLine({ spec, height }: { spec: ChartSpec; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={spec.data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey={spec.xKey} tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={52} />
        <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: unknown, name: unknown) => [fmt(Number(v)), toLabel(String(name))]} />
        <Legend formatter={(val) => <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{toLabel(val)}</span>} />
        {spec.yKeys.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} strokeWidth={2} dot={spec.data.length <= 24} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function SimpleBar({ spec, height }: { spec: ChartSpec; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={spec.data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey={spec.xKey} tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={52} />
        <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [fmt(Number(v))]} />
        <Bar dataKey={spec.yKeys[0]} radius={[3, 3, 0, 0]} fill={SRI.ink} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DeltaBar({ spec, height }: { spec: ChartSpec; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={spec.data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
        <XAxis dataKey={spec.xKey} tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={fmt} width={52} />
        <Tooltip contentStyle={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [fmt(Number(v))]} />
        <ReferenceLine y={0} stroke={SRI.ink} strokeWidth={1} strokeOpacity={0.3} />
        <Bar dataKey={spec.yKeys[0]} radius={[3, 3, 0, 0]}>
          {spec.data.map((row, i) => (
            <Cell key={i} fill={Number(row[spec.yKeys[0]]) >= 0 ? SRI.ink : SRI.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Single chart panel ────────────────────────────────────────────────────────

function ChartPanel({ spec, height = 180 }: { spec: ChartSpec; height?: number }) {
  const [fullscreen, setFullscreen] = useState(false);

  const body = () => {
    if (spec.type === "multi-line") return <MultiLine spec={spec} height={height} />;
    if (spec.type === "line")       return <SingleLine spec={spec} height={height} />;
    if (spec.type === "bar-delta")  return <DeltaBar  spec={spec} height={height} />;
    return <SimpleBar spec={spec} height={height} />;
  };

  const bodyFull = () => {
    if (spec.type === "multi-line") return <MultiLine spec={spec} height={360} />;
    if (spec.type === "line")       return <SingleLine spec={spec} height={360} />;
    if (spec.type === "bar-delta")  return <DeltaBar  spec={spec} height={360} />;
    return <SimpleBar spec={spec} height={360} />;
  };

  return (
    <>
      <div className="rounded-lg px-4 pt-3 pb-4" style={{ background: "#fff", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-1 mb-2">
          <span className="flex-1 text-xs font-medium" style={{ color: "var(--text-muted)" }}>{spec.title}</span>
          <button onClick={() => setFullscreen(true)} className="p-1 rounded hover:bg-black/5 transition-colors" style={{ color: "var(--text-muted)" }}>
            <Maximize2 size={11} />
          </button>
        </div>
        {body()}
      </div>
      {fullscreen && (
        <FullscreenOverlay title={spec.title} onClose={() => setFullscreen(false)}>
          {bodyFull()}
        </FullscreenOverlay>
      )}
    </>
  );
}

// ── Grid layout ───────────────────────────────────────────────────────────────

export default function ChartGrid({ tableData }: { tableData: TableData }) {
  const specs = determineCharts(tableData);
  if (!specs.length) return null;

  if (specs.length === 1) {
    return <ChartPanel spec={specs[0]} height={200} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* First chart full width */}
      <ChartPanel spec={specs[0]} height={200} />
      {/* Remaining charts side by side */}
      {specs.length > 1 && (
        <div style={{ display: "grid", gridTemplateColumns: specs.length === 2 ? "1fr" : "1fr 1fr", gap: "12px" }}>
          {specs.slice(1).map((spec, i) => (
            <ChartPanel key={i} spec={spec} height={170} />
          ))}
        </div>
      )}
    </div>
  );
}

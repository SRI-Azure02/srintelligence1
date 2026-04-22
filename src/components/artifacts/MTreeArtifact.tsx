"use client"

import React, { useRef, useState } from 'react'
import type { AgentArtifact } from '../../types/agent'
// recharts removed — waterfall now uses inline SVG for precise stair rendering

// ---------------------------------------------------------------------------
// Data interfaces
// ---------------------------------------------------------------------------

interface TreeNode {
  feature: string
  importance: number
  rank: number
  interpretation?: string
}

interface WaterfallItem {
  segment: string
  contribution: number // pp change — positive or negative
}

interface MTreeData {
  nodes: TreeNode[]
  waterfall: WaterfallItem[]
  insights: string[]
  summary: string
  metric?: string
  baseline?: number
  current?: number
  change?: number
  /** The `# Heading` extracted from the agent narrative, e.g. "Drivers of BRAND1 Market Share Change in Cluster 0 (H1 → H2 2025)" */
  title?: string
}

// ---------------------------------------------------------------------------
// Narrative parser
// ---------------------------------------------------------------------------

function parseMTreeNarrative(text: string): MTreeData {
  // Strip "Decomposition complete …" footer lines
  const cleaned = text
    .replace(/Decomposition complete[^\n]*/gi, '')
    .replace(/duration:\s*[\d,]+ms[^\n]*/gi, '')
    .replace(/cache:\s*(hit|miss)[^\n]*/gi, '')
    .trim()

  // ── Extract page title from first `#` heading ─────────────────────────────
  // e.g. "# Drivers of BRAND1 Market Share Change in Cluster 0 (H1 → H2 2025)"
  const headingM = cleaned.match(/^#+\s+(.+)/m)
  const title = headingM ? headingM[1].trim() : undefined

  // ── Extract tree nodes ─────────────────────────────────────────────────────
  const nodes: TreeNode[] = []

  // Priority: 4-column ranked driver table output by the Cortex agent:
  //   | **1** | **Patient Gender** | Female patients | **+1.78pp** |
  // After stripping ** → | 1 | Patient Gender | Female patients | +1.78pp |
  const driverTableRe = /^\|\s*\*{0,2}(\d+)\*{0,2}\s*\|\s*\*{0,2}([^|]+?)\*{0,2}\s*\|\s*[^|]+?\|\s*\*{0,2}([+\-]?\d+\.?\d*)pp\*{0,2}\s*\|/gm
  let dtm: RegExpExecArray | null
  while ((dtm = driverTableRe.exec(cleaned)) !== null) {
    const dRank = parseInt(dtm[1])
    const feature = dtm[2].trim()
    const impact = Math.abs(parseFloat(dtm[3]))
    if (!isNaN(dRank) && feature.length > 1 && !isNaN(impact)) {
      nodes.push({ feature, importance: impact, rank: dRank })
    }
  }

  // Fallback: look for a UPPERCASE_FEATURE | number table
  if (nodes.length === 0) {
    const tableRe = /\|\s*([A-Z_]+)\s*\|\s*([\d.]+)\s*\|([^|\n]*)/g
    let tm: RegExpExecArray | null
    let rank = 1
    while ((tm = tableRe.exec(cleaned)) !== null) {
      const feature = tm[1].trim()
      const importance = parseFloat(tm[2])
      if (!isNaN(importance) && feature.length > 1) {
        nodes.push({ feature, importance, rank: rank++, interpretation: tm[3].trim().replace(/\|/g, '').trim() })
      }
    }
  }

  // Fallback 2: bullet / bold "FEATURE importance: 0.42" patterns
  if (nodes.length === 0) {
    const bulletRe = /\*{0,2}([A-Z_]{2,})\*{0,2}[^::\n]*(?:importance|score|weight)[^::\n]*[:：]\s*([\d.]+)([^\n]*)/gi
    let bm: RegExpExecArray | null
    let rank = 1
    while ((bm = bulletRe.exec(cleaned)) !== null) {
      const importance = parseFloat(bm[2])
      if (!isNaN(importance)) {
        nodes.push({
          feature: bm[1].trim(),
          importance,
          rank: rank++,
          interpretation: bm[3].replace(/[()]/g, '').trim(),
        })
      }
    }
  }

  // Fallback 3: ASCII tree labels like "├── SPECIALTY (Top Driver)"
  if (nodes.length === 0) {
    const asciiRe = /[├└]──\s*([A-Za-z/_-]{2,})(?:\s*\(([^)]+)\))?/g
    let am: RegExpExecArray | null
    let rank = 1
    while ((am = asciiRe.exec(cleaned)) !== null) {
      nodes.push({
        feature: am[1].trim(),
        importance: 1 / rank,
        rank: rank++,
        interpretation: am[2]?.trim(),
      })
    }
  }

  // Sort by importance desc, re-rank
  nodes.sort((a, b) => b.importance - a.importance)
  nodes.forEach((n, i) => { n.rank = i + 1 })

  // ── Extract waterfall items ─────────────────────────────────────────────────
  const waterfall: WaterfallItem[] = []

  // Track Running% values to derive baseline/current if text patterns don't match.
  // 7-column table: | ID | Segment | H1% | H2% | Seg Δpp | Weighted Contribution | Running% |
  // Running% after row n = baseline + Σ contributions[0..n], so:
  //   baseline = Running%[0] − contribution[0]
  //   current  = Running%[last]
  let _tableBaseline: number | undefined
  let _tableCurrent: number | undefined

  const wfSectionM = cleaned.match(/Waterfall\s+Attribution[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i)
  if (wfSectionM) {
    const tableBlock = wfSectionM[1]
    let firstContrib: number | undefined
    let firstRunning: number | undefined

    for (const line of tableBlock.split('\n')) {
      if (!line.includes('|')) continue
      const cols = line.split('|').map(c => c.trim().replace(/\*+/g, '').trim())
      // 7-column rows → split produces 9 elements: ['', id, seg, h1, h2, delta, contrib, running, '']
      if (cols.length < 8) continue
      const segLabel = cols[2]
      const contribStr = cols[6]
      const runningStr = cols[7]
      // Skip separator / header rows
      if (!segLabel || /^[-:\s]+$/.test(segLabel)) continue
      if (/segment|description|label|feature|driver/i.test(segLabel)) continue
      // Skip the Final/Net Result row (baseline/current handled separately)
      if (/net\s*result|final/i.test(cols[1]) || /net\s*result|final/i.test(segLabel)) continue
      // Parse contribution: strip pp, %, + but keep minus sign
      const val = parseFloat(contribStr.replace(/[p%+\s]/gi, ''))
      if (!isNaN(val)) {
        waterfall.push({ segment: segLabel, contribution: val })
        // Capture Running% for baseline/current derivation
        const runningVal = parseFloat(runningStr.replace(/[p%+\s*]/gi, ''))
        if (!isNaN(runningVal)) {
          if (firstRunning === undefined) { firstRunning = runningVal; firstContrib = val }
          _tableCurrent = runningVal
        }
      }
    }

    // Derive baseline from first row: Running%[0] − contribution[0] = baseline
    if (firstRunning !== undefined && firstContrib !== undefined) {
      _tableBaseline = firstRunning - firstContrib
    }
  }

  // Fallback: simple 2-column table "| Label | +2.34 pp |"
  // Only used when NO "Waterfall Attribution" section was found at all, to avoid
  // the 2-column regex accidentally matching the wrong columns in a 7-col table.
  if (waterfall.length === 0 && !wfSectionM) {
    const wfTableRe = /\|\s*([^|]+?)\s*\|\s*([+\-]?\d+\.?\d*)\s*pp?\s*\|/gi
    let wm: RegExpExecArray | null
    while ((wm = wfTableRe.exec(cleaned)) !== null) {
      const seg = wm[1].trim().replace(/\*+/g, '')
      const val = parseFloat(wm[2])
      if (!isNaN(val) && seg.length > 1 && !/^[-=]+$/.test(seg)) {
        waterfall.push({ segment: seg, contribution: val })
      }
    }
  }

  // Fallback 2: bullet/inline "- Segment: +2.34 pp"
  if (waterfall.length === 0) {
    const wfBulletRe = /[-•]\s+([^::\n]{3,60})[:\s]+([+\-]?\d+\.?\d*)\s*pp/gi
    let wb: RegExpExecArray | null
    while ((wb = wfBulletRe.exec(cleaned)) !== null) {
      const val = parseFloat(wb[2])
      if (!isNaN(val)) {
        waterfall.push({ segment: wb[1].trim().replace(/\*+/g, ''), contribution: val })
      }
    }
  }

  // ── Extract key insights (numbered list) ───────────────────────────────────
  const insights: string[] = []
  const insightSectionM = cleaned.match(/(?:Key\s+Insights?|Insights?)[^\n]*\n([\s\S]*?)(?:\n#{1,3}\s|$)/i)
  if (insightSectionM) {
    const insightBlock = insightSectionM[1]
    const insightLineRe = /^\s*\d+\.\s+(.+)/gm
    let im: RegExpExecArray | null
    while ((im = insightLineRe.exec(insightBlock)) !== null) {
      insights.push(im[1].trim())
    }
  }

  // ── Extract summary ────────────────────────────────────────────────────────
  let summary = ''
  const summaryM = cleaned.match(/(?:Summary|Conclusion)[^\n]*\n([\s\S]*?)(?:\n#{1,3}\s|$)/i)
  if (summaryM) {
    summary = summaryM[1]
      .split('\n')
      .map(l => l.replace(/^[-•*]\s*/, '').trim())
      .filter(l => l.length > 5)
      .join('\n')
  }
  if (!summary) {
    const paras = cleaned.split(/\n\n+/).filter(p => p.trim().length > 20)
    summary = paras[paras.length - 1]?.trim() ?? ''
  }

  // ── Extract overall change metric, baseline, current ──────────────────────
  const changeM = cleaned.match(/([+\-]?\d+\.?\d*)\s*pp\s*(?:market\s+share|change|increase|decrease)/i)
  const change = changeM ? parseFloat(changeM[1]) : undefined

  // Look for "from X% to Y%", "Baseline: X%", "Final: Y%" — try several patterns.
  const fromToM =
    cleaned.match(/from\s+([\d.]+)%\s+to\s+([\d.]+)%/i) ??
    cleaned.match(/([\d.]+)%\s+(?:in\s+H1|in\s+period\s+1|baseline)[^\n]*?to\s+([\d.]+)%/i)

  const baselineText = fromToM
    ? parseFloat(fromToM[1])
    : cleaned.match(/[Bb]aseline[:\s]+([\d.]+)%/)?.[1]
      ? parseFloat(cleaned.match(/[Bb]aseline[:\s]+([\d.]+)%/)![1])
      : cleaned.match(/H1\s+(?:overall\s+)?(?:market\s+share|share)[:\s]+([\d.]+)%/i)?.[1]
        ? parseFloat(cleaned.match(/H1\s+(?:overall\s+)?(?:market\s+share|share)[:\s]+([\d.]+)%/i)![1])
        : undefined

  const currentText = fromToM
    ? parseFloat(fromToM[2])
    : cleaned.match(/[Ff]inal[:\s]+([\d.]+)%/)?.[1]
      ? parseFloat(cleaned.match(/[Ff]inal[:\s]+([\d.]+)%/)![1])
      : cleaned.match(/H2\s+(?:overall\s+)?(?:market\s+share|share)[:\s]+([\d.]+)%/i)?.[1]
        ? parseFloat(cleaned.match(/H2\s+(?:overall\s+)?(?:market\s+share|share)[:\s]+([\d.]+)%/i)![1])
        : baselineText != null && change != null ? baselineText + change : undefined

  // Prefer text-pattern values; fall back to Running%-derived values from the table.
  const baseline = baselineText ?? _tableBaseline
  const current  = currentText  ?? _tableCurrent

  return { nodes, waterfall, insights, summary, change, baseline, current, title }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1.5 mb-4">
        {title}
      </h3>
      {children}
    </div>
  )
}

// ── Visual decision tree ───────────────────────────────────────────────────────

const NODE_COLORS = ['#4E79A7', '#F28E2B', '#59A14F', '#E15759', '#B07AA1', '#9C755F']

function interpretationLabel(rank: number, score: number): string {
  if (rank === 1 || score >= 0.35) return 'Top Driver'
  if (score >= 0.20) return 'Strong Influence'
  if (score >= 0.10) return 'Moderate Influence'
  return 'Minor Influence'
}

function interpretationDetail(rank: number, feature: string, score: number, existingInterpretation?: string): string {
  if (existingInterpretation && existingInterpretation.length > 4) return existingInterpretation
  const scoreLabel = score >= 0.35 ? 'dominantly' : score >= 0.20 ? 'strongly' : score >= 0.10 ? 'moderately' : 'marginally'
  return `${feature} ${scoreLabel} influences the outcome`
}

function VisualDecisionTree({ nodes }: { nodes: TreeNode[] }) {
  if (nodes.length === 0) {
    return <p className="text-sm text-gray-400 italic">No driver data available.</p>
  }

  const maxImportance = nodes[0]?.importance ?? 1

  return (
    <div className="flex flex-col items-center gap-0 select-none">
      {/* Root node */}
      <div
        className="flex items-center justify-center rounded-2xl px-6 py-3 text-white text-sm font-bold shadow-md"
        style={{ background: 'linear-gradient(135deg, #2891DA 0%, #1a6fb0 100%)', minWidth: 160 }}
      >
        Root
      </div>

      {/* Connector from root to the horizontal bar */}
      <div className="w-0.5 h-6 bg-gray-300" />

      {/* Horizontal connector spanning all children */}
      <div className="relative w-full" style={{ height: 2 }}>
        <div
          className="absolute top-0 bg-gray-300"
          style={{
            height: 2,
            left: nodes.length > 1 ? `${(1 / (nodes.length * 2)) * 100}%` : '50%',
            right: nodes.length > 1 ? `${(1 / (nodes.length * 2)) * 100}%` : '50%',
          }}
        />
      </div>

      {/* ── Row A: vertical drop connectors + node boxes (items-stretch = equal height) ── */}
      <div className="flex items-stretch gap-4 w-full justify-center">
        {nodes.map((node, i) => {
          const color = NODE_COLORS[i % NODE_COLORS.length]
          return (
            <div key={node.feature} className="flex flex-col items-center flex-1 min-w-0" style={{ maxWidth: 200 }}>
              {/* Vertical drop from horizontal bar to node box */}
              <div className="w-0.5 h-6 bg-gray-300 shrink-0" />
              {/* Node box — no variable-height content here → all boxes match the tallest */}
              <div
                className="rounded-xl border-2 px-3 py-2.5 text-center w-full shadow-sm flex flex-col items-center justify-center flex-1"
                style={{ borderColor: color, background: `${color}12` }}
              >
                <div className="font-bold text-xs w-full break-words" style={{ color }}>
                  {node.feature}
                </div>
                {node.rank === 1 && (
                  <span
                    className="inline-block mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                    style={{ background: color }}
                  >
                    Top Driver
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Row B: importance bars (separate row — doesn't affect node-box heights) ── */}
      <div className="flex gap-4 w-full justify-center mt-3">
        {nodes.map((node, i) => {
          const color = NODE_COLORS[i % NODE_COLORS.length]
          const barPct = (node.importance / maxImportance) * 100
          const label = interpretationLabel(node.rank, node.importance)
          const detail = interpretationDetail(node.rank, node.feature, node.importance, node.interpretation)
          return (
            <div key={`imp-${node.feature}`} className="flex-1 min-w-0 px-1" style={{ maxWidth: 200 }}>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="font-semibold" style={{ color }}>Importance</span>
                <span className="text-gray-600">{node.importance.toFixed(2)}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: color }} />
              </div>
              <p className="mt-1.5 text-[10px] text-gray-500 leading-snug text-center">
                {label} — {detail}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Waterfall bar chart ────────────────────────────────────────────────────────

const WATERFALL_POS  = '#6aaa84'  // muted green
const WATERFALL_NEG  = '#c97a7a'  // muted red
const WATERFALL_BASE = '#3b82f6'  // blue for total / baseline / final

interface WaterfallChartProps {
  items: WaterfallItem[]
  baseline?: number
  current?: number
}

// A single bar's data in the SVG waterfall.
interface WFBar {
  label: string
  /** Bottom value of the bar (value-space, not pixels). */
  yBot: number
  /** Top value of the bar (value-space). */
  yTop: number
  isTotal: boolean
  isNeg: boolean
  /** Raw value for tooltip. */
  raw: number
}

function WaterfallChart({ items, baseline, current }: WaterfallChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; bar: WFBar } | null>(null)

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w) setContainerWidth(Math.floor(w))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (items.length === 0) {
    return <p className="text-sm text-gray-400 italic">No waterfall data available.</p>
  }

  // ── Normalise contributions so baseline + Σ contributions = final ─────────
  const baseVal   = baseline ?? 0
  const rawSum    = items.reduce((s, i) => s + i.contribution, 0)
  const finalVal  = current ?? (baseVal + rawSum)
  const targetGap = finalVal - baseVal

  const scaledItems: WaterfallItem[] =
    rawSum !== 0 && Math.abs(rawSum - targetGap) > 0.001
      ? items.map(i => ({ ...i, contribution: (i.contribution / rawSum) * targetGap }))
      : items

  // ── Build bar descriptors ─────────────────────────────────────────────────
  const bars: WFBar[] = []
  bars.push({ label: 'Baseline', yBot: 0, yTop: baseVal, isTotal: true, isNeg: false, raw: baseVal })
  let running = baseVal
  for (const item of scaledItems) {
    const isNeg  = item.contribution < 0
    const newRun = running + item.contribution
    bars.push({
      label:   item.segment,
      yBot:    isNeg ? newRun : running,  // bottom of bar (lower value)
      yTop:    isNeg ? running : newRun,  // top of bar (higher value)
      isTotal: false,
      isNeg,
      raw:     item.contribution,
    })
    running = newRun
  }
  bars.push({ label: 'Final', yBot: 0, yTop: finalVal, isTotal: true, isNeg: false, raw: finalVal })

  // ── SVG layout constants ──────────────────────────────────────────────────
  const W   = containerWidth > 0 ? containerWidth : 700
  const H   = 300
  const ML  = 48   // left margin (Y-axis labels)
  const MR  = 16
  const MT  = 12
  const MB  = 72   // bottom margin (rotated X labels)
  const plotW = W - ML - MR
  const plotH = H - MT - MB
  const MIN_BAR_PX = 4  // minimum rendered bar height

  // ── Y scale ──────────────────────────────────────────────────────────────
  const allY   = bars.flatMap(b => [b.yBot, b.yTop])
  const domMin = Math.min(0, ...allY)
  const domMax = Math.max(...allY)
  const domRange = domMax - domMin || 1
  const yPad   = domRange * 0.08          // 8% headroom at top

  // sy: value → SVG y-pixel (higher value = smaller y = closer to top)
  const sy = (v: number) =>
    MT + plotH * (1 - (v - domMin) / (domRange + yPad))

  // ── X layout ─────────────────────────────────────────────────────────────
  const slotW  = plotW / bars.length
  const barW   = Math.max(20, Math.min(56, slotW * 0.62))
  const bx     = (i: number) => ML + i * slotW + (slotW - barW) / 2   // left edge of bar i

  // ── Y-axis ticks ─────────────────────────────────────────────────────────
  const N_TICKS = 5
  const tickStep = (domMax - domMin) / N_TICKS
  const yTicks   = Array.from({ length: N_TICKS + 1 }, (_, k) => domMin + k * tickStep)

  // ── Fill colour helper ────────────────────────────────────────────────────
  const barFill = (b: WFBar) =>
    b.isTotal ? WATERFALL_BASE : b.isNeg ? WATERFALL_NEG : WATERFALL_POS

  return (
    <div ref={containerRef} className="relative select-none">
      <svg
        width={W}
        height={H}
        style={{ overflow: 'visible' }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* ── Grid lines & Y axis ── */}
        {yTicks.map((tick, k) => {
          const py = sy(tick)
          return (
            <g key={k}>
              <line x1={ML} y1={py} x2={ML + plotW} y2={py}
                stroke="#f0f0f0" strokeWidth={1} />
              <text x={ML - 6} y={py + 4}
                textAnchor="end" fontSize={10} fill="#9ca3af">
                {tick.toFixed(1)}
              </text>
            </g>
          )
        })}

        {/* Zero reference line */}
        <line x1={ML} y1={sy(0)} x2={ML + plotW} y2={sy(0)}
          stroke="#d1d5db" strokeWidth={1} />

        {/* ── Bars + connectors ── */}
        {bars.map((bar, i) => {
          const x    = bx(i)
          const rawH = sy(bar.yBot) - sy(bar.yTop)   // pixels, always ≥ 0
          const barH = Math.max(rawH, MIN_BAR_PX)
          // If the bar is so thin we padded it, push the top up so bottom stays anchored.
          const barY = sy(bar.yTop) - Math.max(0, MIN_BAR_PX - rawH)

          // Stair connector: horizontal line from right edge of this bar
          // to left edge of next bar, at the value where the next bar starts.
          // For total bars: connector height = bar top (= bar value).
          // For neg bars:   connector height = bar bottom (new running total).
          // For pos bars:   connector height = bar top (new running total).
          const nextBar = bars[i + 1]
          const showConnector = !!nextBar
          // The y-value where the next bar will start (its yBot for pos/total, its yTop for neg)
          const connectorVal = bar.isNeg ? bar.yBot : bar.yTop
          const connY        = sy(connectorVal)
          const nextX        = nextBar ? bx(i + 1) : 0

          return (
            <g key={i}>
              {/* Main bar */}
              <rect
                x={x} y={barY} width={barW} height={barH}
                fill={barFill(bar)} opacity={0.88} rx={2}
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => {
                  const svg = (e.currentTarget as SVGRectElement).ownerSVGElement!
                  const rect = svg.getBoundingClientRect()
                  setTooltip({
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top,
                    bar,
                  })
                }}
                onMouseMove={e => {
                  const svg = (e.currentTarget as SVGRectElement).ownerSVGElement!
                  const rect = svg.getBoundingClientRect()
                  setTooltip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null)
                }}
                onMouseLeave={() => setTooltip(null)}
              />

              {/* Stair connector to next bar */}
              {showConnector && (
                <line
                  x1={x + barW} y1={connY}
                  x2={nextX}    y2={connY}
                  stroke="#9ca3af" strokeWidth={1}
                  strokeDasharray="3 2"
                  pointerEvents="none"
                />
              )}

              {/* X-axis label */}
              <text
                x={x + barW / 2}
                y={H - MB + 10}
                textAnchor="end"
                fontSize={10}
                fill="#6b7280"
                transform={`rotate(-38, ${x + barW / 2}, ${H - MB + 10})`}
              >
                {bar.label.length > 22 ? bar.label.slice(0, 22) + '…' : bar.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* ── Tooltip ── */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold text-gray-800 mb-0.5">{tooltip.bar.label}</p>
          <p style={{ color: barFill(tooltip.bar) }}>
            {tooltip.bar.isTotal
              ? tooltip.bar.raw.toFixed(2)
              : (tooltip.bar.isNeg ? '' : '+') + tooltip.bar.raw.toFixed(2) + ' pp'}
          </p>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500 justify-center">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: WATERFALL_POS }} />
          Positive contribution
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: WATERFALL_NEG }} />
          Negative contribution
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: WATERFALL_BASE }} />
          Baseline / Final
        </span>
      </div>
    </div>
  )
}

// ── Inline markdown renderer ───────────────────────────────────────────────────

function renderMd(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-900">{p.slice(2, -2)}</strong>
      : p.replace(/\*\*/g, '')
  )
}

// ── Key Insights + Summary card ────────────────────────────────────────────────

function InsightsSummaryCard({
  insights,
  summary,
}: {
  insights: string[]
  summary: string
}) {
  // Parse emoji-prefixed bullet lines from summary
  const summaryLines = summary
    .split('\n')
    .map(l => l.replace(/^[-•]\s*/, '').trim())
    .filter(l => l.length > 3)

  return (
    <div className="flex flex-col gap-5">
      {insights.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
            Key Insights
          </h4>
          <ol className="space-y-3 list-none p-0 m-0">
            {insights.map((insight, i) => {
              // Split on first colon to get optional heading
              const colonIdx = insight.indexOf(':')
              const heading = colonIdx > 0 && colonIdx < 60 ? insight.slice(0, colonIdx).trim() : null
              const body    = heading ? insight.slice(colonIdx + 1).trim() : insight
              return (
                <li key={i} className="flex gap-3">
                  <span
                    className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: NODE_COLORS[i % NODE_COLORS.length] }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {heading && (
                      <span className="font-semibold text-gray-900">{renderMd(heading)}: </span>
                    )}
                    {renderMd(body)}
                  </p>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {summaryLines.length > 0 && (
        <div>
          <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
            Summary
          </h4>
          <ul className="space-y-1.5 list-none p-0 m-0">
            {summaryLines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-gray-400 flex-shrink-0" />
                <span>{renderMd(line)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  artifact: AgentArtifact
}

export default function MTreeArtifact({ artifact }: Props) {
  const narrative = artifact.narrative ?? ''
  const rawData   = (artifact.data ?? {}) as Record<string, unknown>

  // If the agent wrote structured drivers, use them; otherwise parse narrative
  const parsed = parseMTreeNarrative(narrative)

  // Merge structured drivers from artifact.data if available
  if (Array.isArray(rawData['drivers']) && (rawData['drivers'] as unknown[]).length > 0) {
    const structured = (rawData['drivers'] as Array<{ feature?: string; label?: string; importance?: number; direction?: string }>)
      .map((d, i) => ({
        feature: d.feature ?? d.label ?? `Driver ${i + 1}`,
        importance: Math.abs(d.importance ?? 0),
        rank: i + 1,
        interpretation: d.direction,
      }))
      .sort((a, b) => b.importance - a.importance)
    structured.forEach((n, i) => { n.rank = i + 1 })
    if (parsed.nodes.length === 0) parsed.nodes.push(...structured)
  }

  const hasTree      = parsed.nodes.length > 0
  const hasWaterfall = parsed.waterfall.length > 0
  const hasInsights  = parsed.insights.length > 0 || parsed.summary.length > 5

  return (
    <div className="flex flex-col gap-4">
      {/* ── Card 1: Decision Tree ──────────────────────────────────────────── */}
      {hasTree && (
        <SectionCard title={parsed.title ?? 'Drivers of Market Share Change'}>
          <VisualDecisionTree nodes={parsed.nodes} />
        </SectionCard>
      )}

      {/* ── Card 2: Waterfall Attribution ─────────────────────────────────── */}
      {hasWaterfall && (
        <SectionCard title="Waterfall Attribution Analysis">
          <WaterfallChart
            items={parsed.waterfall}
            baseline={parsed.baseline}
            current={parsed.current}
          />
        </SectionCard>
      )}

      {/* ── Card 3: Key Insights + Summary ────────────────────────────────── */}
      {hasInsights && (
        <SectionCard title="Key Insights &amp; Summary">
          <InsightsSummaryCard insights={parsed.insights} summary={parsed.summary} />
        </SectionCard>
      )}

      {/* Fallback: show raw narrative if parser extracted nothing */}
      {!hasTree && !hasWaterfall && !hasInsights && narrative && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
          {narrative
            .replace(/Decomposition complete[^\n]*/gi, '')
            .replace(/duration:\s*[\d,]+ms[^\n]*/gi, '')
            .replace(/cache:\s*(hit|miss)[^\n]*/gi, '')
            .trim()}
        </div>
      )}
    </div>
  )
}

"use client"

import React, { useRef, useState } from 'react'
import type { AgentArtifact } from '../../types/agent'
import {
  ComposedChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts'

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

  // Primary: row-splitting parser for the 7-column table produced by the Cortex agent:
  //   | ID | Segment Description | H1% | H2% | Seg Δpp | Weighted Contribution | Running% |
  // e.g. | 1a | Specialty = OB/GYN | 39.41% | 40.99% | +1.58pp | +0.95pp | 36.29% |
  const wfSectionM = cleaned.match(/Waterfall\s+Attribution[^\n]*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i)
  if (wfSectionM) {
    const tableBlock = wfSectionM[1]
    for (const line of tableBlock.split('\n')) {
      if (!line.includes('|')) continue
      const cols = line.split('|').map(c => c.trim().replace(/\*+/g, '').trim())
      // 7-column rows → split produces 9 elements: ['', id, seg, h1, h2, delta, contrib, running, '']
      if (cols.length < 8) continue
      const segLabel = cols[2]
      const contribStr = cols[6]
      // Skip separator / header rows
      if (!segLabel || /^[-:\s]+$/.test(segLabel)) continue
      if (/segment|description|label|feature|driver/i.test(segLabel)) continue
      // Skip the Final/Net Result row (baseline/current handled separately)
      if (/net\s*result|final/i.test(cols[1]) || /net\s*result|final/i.test(segLabel)) continue
      // Parse contribution: strip pp, %, + but keep minus sign
      const val = parseFloat(contribStr.replace(/[p%+\s]/gi, ''))
      if (!isNaN(val)) {
        waterfall.push({ segment: segLabel, contribution: val })
      }
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

  // Look for "from X% to Y%" or "Baseline: X%" / "Final: Y%" patterns
  const fromToM = cleaned.match(/from\s+([\d.]+)%\s+to\s+([\d.]+)%/i)
  const baseline = fromToM
    ? parseFloat(fromToM[1])
    : cleaned.match(/[Bb]aseline[:\s]+([\d.]+)%/)?.[1]
      ? parseFloat(cleaned.match(/[Bb]aseline[:\s]+([\d.]+)%/)![1])
      : undefined
  const current = fromToM
    ? parseFloat(fromToM[2])
    : cleaned.match(/[Ff]inal[:\s]+([\d.]+)%/)?.[1]
      ? parseFloat(cleaned.match(/[Ff]inal[:\s]+([\d.]+)%/)![1])
      : baseline != null && change != null ? baseline + change : undefined

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
const WATERFALL_BASE = '#3b82f6'  // blue for total

interface WaterfallChartProps {
  items: WaterfallItem[]
  baseline?: number
  current?: number
}

function WaterfallChart({ items, baseline, current }: WaterfallChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

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
  // The agent sometimes emits absolute market-share percentages instead of
  // delta pp values, which makes the staircase wildly overshoot the final bar.
  // Scaling every contribution by the same factor preserves their relative
  // proportions while guaranteeing the chart is visually coherent.
  const baseVal  = baseline ?? 0
  const rawSum   = items.reduce((s, i) => s + i.contribution, 0)
  const finalVal = current ?? (baseVal + rawSum)
  const targetGap = finalVal - baseVal  // the gap we need to bridge

  const scaledItems: WaterfallItem[] =
    rawSum !== 0 && Math.abs(rawSum - targetGap) > 0.001
      ? items.map(i => ({ ...i, contribution: (i.contribution / rawSum) * targetGap }))
      : items

  // Build recharts data: invisible "offset" bar + visible value bar
  type WFPoint = {
    name: string
    offset: number
    value: number
    isNeg: boolean
    isTotal: boolean
    raw: number
  }

  const chartData: WFPoint[] = []

  // Baseline bar — always shown (full bar from 0)
  chartData.push({ name: 'Baseline', offset: 0, value: baseVal, isNeg: false, isTotal: true, raw: baseVal })
  let running = baseVal

  for (const item of scaledItems) {
    const isNeg = item.contribution < 0
    const offset = isNeg ? running + item.contribution : running
    chartData.push({
      name: item.segment,
      offset: Math.max(0, offset),
      value: Math.abs(item.contribution),
      isNeg,
      isTotal: false,
      raw: item.contribution,
    })
    running += item.contribution
  }

  // Final bar — always shown (full bar from 0)
  chartData.push({ name: 'Final', offset: 0, value: finalVal, isNeg: false, isTotal: true, raw: finalVal })

  const maxVal = Math.max(...chartData.map(d => d.offset + d.value), 1)
  const chartH = 280
  const chartW = containerWidth > 0 ? containerWidth - 32 : 700

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: WFPoint }[] }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs">
        <p className="font-semibold text-gray-800 mb-1">{d.name}</p>
        <p style={{ color: d.isTotal ? WATERFALL_BASE : d.isNeg ? WATERFALL_NEG : WATERFALL_POS }}>
          {d.isTotal ? d.raw.toFixed(2) : (d.isNeg ? '' : '+') + d.raw.toFixed(2) + ' pp'}
        </p>
      </div>
    )
  }

  return (
    <div ref={containerRef}>
      <div style={{ width: chartW, height: chartH }}>
        <ComposedChart
          width={chartW}
          height={chartH}
          data={chartData}
          margin={{ top: 8, right: 16, bottom: 60, left: 32 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            angle={-35}
            textAnchor="end"
            height={56}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#6b7280' }}
            tickFormatter={(v: number) => v.toFixed(1)}
            domain={[0, maxVal * 1.12]}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={1} />
          {/* Invisible spacer bar that lifts the visible bar to the right baseline */}
          <Bar dataKey="offset" stackId="wf" fill="transparent" isAnimationActive={false} legendType="none" />
          {/* Visible contribution bar */}
          <Bar dataKey="value" stackId="wf" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {chartData.map((entry, i) => (
              <Cell
                key={`cell-${i}`}
                fill={entry.isTotal ? WATERFALL_BASE : entry.isNeg ? WATERFALL_NEG : WATERFALL_POS}
                opacity={0.85}
              />
            ))}
          </Bar>
        </ComposedChart>
      </div>

      {/* Legend */}
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

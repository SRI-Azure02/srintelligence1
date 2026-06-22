@AGENTS.md

---

# SRIntelligence — Project-Specific Rules

These rules capture bugs, fixes, and hard-won lessons specific to this codebase's stack and business logic. Framework-portable lessons live in `~/.claude/REACT_NEXTJS_PATTERNS.md`.

---

### 1. `AnalystResponse` has no `columns` field — columns require SQL execution

**Error encountered**: `TS2339: Property 'columns' does not exist on type 'AnalystResponse'` caused a Vercel build failure after adding `autoResp.columns` to the auto-cohort path in `src/lib/router/route-dispatcher.ts`.

**Fix**: Removed `autoCohortCols` and the `autoResp.columns` reference entirely. `callCortexAnalyst()` (in `src/lib/snowflake/analyst-api.ts`) returns `{ text, sql?, data?, suggestions, error?, requestId? }` only — no column metadata.

**Rule**: Never assume `callCortexAnalyst()` returns column names. If you need column metadata for a cohort, execute the SQL separately via `executeSQL()` after receiving it, or parse column names from the SQL string. The `AnalystResponse` interface is the source of truth; check it before adding new field references.

---

### 2. In-memory `sessionStore` resets on Vercel cold starts — CAUSAL intents must handle missing `priorSQL`

**Error encountered**: Causal inference failed silently (zero rows or agent error) on fresh Vercel sessions. `this.context.getLastAnalystResult()` returned `undefined` because `sessionStore` is an in-memory Map that is wiped on every cold start. `enrichMessage()` then sent the causal agent a bare user message with no cohort SQL.

**Fix**: Added an auto-cohort gate in `src/lib/router/route-dispatcher.ts` PATH B-AGENT (after `const isCausalIntent = ...`, around line 1261). When `isCausalIntent && !lastSQL`: (a) call `missingCausalContext(message)` — if timeframe is absent, return a clarification `AgentResult` and set `skipAgentCall = true`; (b) if timeframe is present, call `callCortexAnalyst()` to synthesize cohort SQL and store it in `autoCohortSQL`.

**Rule**: Any intent that reads prior session state (`getLastAnalystResult`, `getLastAnalystSQL`, `getLastClusterMeta`) must handle the `undefined` / cold-start case explicitly. On Vercel, every cold start is a fresh process — assume no session history exists.

---

### 3. Cortex Analyst returns zero rows when no explicit timeframe is given

**Error encountered**: Cortex Analyst generated SQL scoped to the current year (2026) when the user's query contained no date range. The dataset covers through H2 2025 only, so every query defaulted to an empty result set.

**Fix**: `missingCausalContext(message: string)` in `src/lib/router/route-dispatcher.ts` checks for year, quarter (`Q1–Q4`), half (`H1/H2`), month name, or period keyword before dispatching. If absent, `buildCausalClarificationPrompt()` returns a user-facing message listing accepted formats and reminding that data runs through H2 2025.

**Rule**: All Cortex Analyst queries must include an explicit date range scoped to 2025 or earlier. Validate for timeframe presence before dispatching to any analyst, causal, or cluster path. The `missingCausalContext()` helper is reusable for any intent that surfaces this failure mode.

---

### 4. `SEMANTIC_VIEW_REGISTRY` has literal placeholder values — `agent/chat` falls back to an invalid semantic model path

**Error encountered**: The Pharma Claims Explorer row in `CORTEX_TESTING.PUBLIC.SEMANTIC_VIEW_REGISTRY` has `STAGE_NAME = '<YOUR_STAGE_NAME>'` and `YAML_FILENAME = '<YOUR_YAML_FILENAME>'` as literal strings. `src/lib/snowflake/semantic-discovery.ts:rowToSemanticViewRef()` detects these via `isPlaceholder()`, sets `fullyQualifiedName = ''`, and filters the row out. The fallback is `CORTEX_TESTING.PUBLIC.CORTEX_TESTCASE` — a plain table path, not a valid `@DB.SCHEMA.STAGE/yaml` Cortex Analyst semantic model reference.

**Fix (deferred)**: Populate real values in the registry. The `/api/cortex` route is unaffected — it reads `process.env.SNOWFLAKE_SEMANTIC_VIEW` directly and never touches the registry.

**Rule**: The `agent/chat` route uses `discoverSemanticViews()` → `getDefaultSemanticView()` from `semantic-discovery.ts`. If the registry row has placeholder values, all Cortex Analyst calls routed through `agent/chat` silently fall back to an invalid path. The `/api/cortex` tab is unaffected. Fix the registry before relying on `agent/chat` for Cortex Analyst queries.

---

### 5. `normalizeCortexSQL()` is NOT applied to PATH B-AGENT (causal / forecast) responses

**Error encountered**: (Latent risk, not confirmed as the current failure cause.) If `SRI_CAUSAL_INFERENCE_AGENT` or `SRI_FORECAST_AGENT` internally generate SQL with ISO date comparisons against `date_rx_filled` (stored as VARCHAR `'YYYYMMDD'`), those comparisons return zero rows. `normalizeCortexSQL()` in `src/lib/snowflake/sql-normalizer.ts` corrects this for Cortex Analyst queries but is called only at `app/api/cortex/route.ts` and in cluster input construction.

**Rule**: `normalizeCortexSQL()` is applied only to Cortex Analyst SQL (via `/api/cortex`) and cluster input queries. PATH B-AGENT responses from causal and forecast agents bypass it entirely. If these agents emit date comparisons, brand-name literals, or `claim_status_code` strings, the normalizer will not catch them. If zero-row issues arise from agent-generated SQL, apply `normalizeCortexSQL()` to any SQL extracted from `cortexResponse.sql` before execution.

---

### 6. Snowflake SQL API returns booleans as strings — `"false"` is truthy in JavaScript

**Error encountered**: All 44 news sources appeared under "Removed" in the Sources tab even though none were deleted. The filter `sources.filter(s => !s.IS_DELETED)` kept returning an empty array because Snowflake's SQL API serialises `BOOLEAN FALSE` as the string `"false"`, and `!"false"` is `false` (the string is truthy).

**Fix**: Added an `isTrue()` helper in `src/components/news/NewsPanel.tsx`:
```typescript
const isTrue = (v: unknown) => v === true || v === "true";
const active  = sources.filter((s) => !isTrue(s.IS_DELETED));
const deleted = sources.filter((s) =>  isTrue(s.IS_DELETED));
```

**Rule**: Never use raw boolean comparisons (`if (row.IS_DELETED)`, `row.IS_ACTIVE === true`, `!row.IS_DELETED`) on columns that come from Snowflake via the SQL API. Always use `isTrue()` or an equivalent that accepts both `true` (boolean) and `"true"` (string). Apply this rule to every BOOLEAN column in every Snowflake result that reaches JavaScript — `IS_ACTIVE`, `IS_DELETED`, `IS_DUPLICATE`, etc.

---

### 7. Snowflake SQL API returns VARIANT columns as JSON strings — must `JSON.parse()` before use

**Error encountered**: `FETCH_CONFIG` (a VARIANT/JSON column) arrived in JavaScript as a raw JSON string (`'{"rssUrl":"https://..."}'`) rather than a parsed object. Code treating it as an object (`fetchConfig.rssUrl`) silently got `undefined`, causing all RSS sources to fail with no error.

**Fix**: Added `parseVariant()` helper in `src/lib/news/sources-registry.ts`:
```typescript
function parseVariant(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw ?? {};
}
// Usage:
fetchConfig: parseVariant(row.FETCH_CONFIG) as SourceConfig['fetchConfig'],
```

**Rule**: All Snowflake VARIANT columns (OBJECT, ARRAY, PARSE_JSON values) arrive as raw JSON strings from the SQL API. Never assume they are already parsed. Always run them through `parseVariant()` or `JSON.parse()` before property access or iteration. This applies to `FETCH_CONFIG`, `TAGS`, `COMPANIES_MENTIONED`, `DRUG_NAMES`, `ERRORS`, and any other VARIANT column in query results.

---

### 8. Snowflake DML `result.rowCount` is always 1 — read the stats row for actual affected count

**Error encountered**: An UPDATE route used `if (result.rowCount === 0)` to detect "source not found". This guard never fired even when the UPDATE matched nothing, because Snowflake's SQL API always returns exactly one row for DML statements — a stats row like `{"number of rows updated": 0}`. `result.rowCount` (i.e. `rows.length`) is therefore always `1`.

**Fix** in `app/api/news/sources/[sourceId]/route.ts`:
```typescript
const rowsUpdated = Number(
  result.rows[0]?.['number of rows updated'] ??
  result.rows[0]?.['number of rows inserted'] ?? 0
);
if (rowsUpdated === 0) {
  return Response.json({ error: 'Source not found or already deleted' }, { status: 404 });
}
```

**Rule**: For any Snowflake UPDATE, INSERT, or DELETE, ignore `result.rowCount` (always 1). Read `result.rows[0]['number of rows updated']` / `['number of rows inserted']` / `['number of rows deleted']` to get the real affected count.

---

### 9. `WHERE IS_DELETED = FALSE` does not match NULL — use `NVL(IS_DELETED, FALSE) = FALSE`

**Error encountered**: The DELETE route was silently not updating rows. The WHERE clause `AND IS_DELETED = FALSE` never matched newly-inserted rows because their `IS_DELETED` column was `NULL` (not explicitly set to `FALSE`). Snowflake's `NULL = FALSE` evaluates to `NULL`, not `TRUE`, so the row was filtered out.

**Fix**: Changed all WHERE clauses that guard on "not deleted" to:
```sql
WHERE NVL(IS_DELETED, FALSE) = FALSE
```

**Rule**: In Snowflake, `NULL = FALSE` is `NULL` (not `TRUE`). Any filter on a nullable BOOLEAN column must use `NVL(col, default_value)`. Additionally, `IS_DELETED IS NOT TRUE` is a syntax error in Snowflake — it does not support `IS [NOT] TRUE/FALSE` predicates. Use `NVL(IS_DELETED, FALSE) = FALSE` or `IS_DELETED IS DISTINCT FROM TRUE` instead.

---

### 10. Corporate pharma newsrooms are JS-rendered SPAs — server-side `fetch()` returns empty HTML shell

**Error encountered**: Sources like `abbvie_media`, `amgen_media`, `astrazeneca_media` (18 total) returned 0 articles when switched to HTML scraping. Fetching their URLs server-side returned `<!DOCTYPE html>` shells with no article content — the actual articles are rendered client-side by React/Angular.

**Fix (partial)**: Two of the 18 companies publish working direct RSS feeds and were switched to `FETCH_METHOD = 'rss'`:
- Novartis: `https://www.novartis.com/news-rss.xml`
- GSK: `https://www.gsk.com/en-gb/media/rss/`

The remaining 16 were deactivated (`IS_ACTIVE = FALSE`). Material disclosures from all of them flow through SEC EDGAR 8-K filings (already an active source). Non-material press releases require a third-party news API (NewsAPI.org, GDELT, etc.).

**Rule**: Before adding any corporate newsroom as an HTML source, verify server-side fetchability by requesting the listing URL with a plain `fetch()` and checking whether `<!DOCTYPE` appears in the response. JS-rendered SPAs will always return empty shells. Only RSS or API fetch methods work reliably for corporate newsrooms.

---

### 11. Scrape orchestrator must use concurrent workers — sequential scraping exceeds Vercel function timeout

**Error encountered**: After fixing `parseVariant()`, all 43 active sources began making real network requests. Sequential `for` loop processing took >60 seconds, hitting the Vercel function timeout (`maxDuration = 60`).

**Fix**: Replaced the sequential loop in `src/lib/news/scrape-orchestrator.ts` with a 6-concurrent-worker pool and raised `maxDuration` to 300 in `app/api/news/trigger/route.ts`:
```typescript
const CONCURRENCY = 6;
const worker = async () => {
  while (idx < sources.length) {
    const i = idx++;
    results[i] = await scrapeSource(sources[i]);
  }
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
```

**Rule**: Any Vercel function that iterates over N external network calls must use a concurrent worker pool, never a sequential `for` loop. Set `CONCURRENCY` based on expected source count (6 works for ~45 sources within 300s). Always set `maxDuration` explicitly — the default 60s is too low for orchestration functions.

---

### 12. `COMPUTED_WEIGHT` bar normalization — normalize against 1.0, not 1.5

**Error encountered**: Article weight bars showed ~74% fill for fresh articles with `COMPUTED_WEIGHT = 1.11`, because the bar was normalized against `1.5` (an arbitrary overcautious cap). The `COMPUTED_WEIGHT` formula is `BASE_WEIGHT × EXP(-λ × age_days) × FEEDBACK_MULTIPLIER`. At `age_days = 0` with `BASE_WEIGHT = 1.0` and `FEEDBACK_MULTIPLIER = 1.0`, the max is `1.0`. Some sources have `BASE_WEIGHT = 1.2`, giving a fresh max of 1.2.

**Fix** in `src/components/news/ArticleCard.tsx`:
```typescript
// BEFORE:
function weightPercent(w: number): number {
  return Math.min(Math.round((w / 1.5) * 100), 100);
}
// AFTER:
function weightPercent(w: number): number {
  return Math.min(Math.round(w * 100), 100);
}
```

**Rule**: Normalize the weight bar against `1.0`. Weights above 1.0 (from high-BASE_WEIGHT sources or upvoted articles) simply cap the bar at 100%, which is correct — the bar represents "how much freshness/signal does this article have left?", where 100% is full and 0% is decayed.

---

### 13. Branch strategy: `develop` for features, `main` for production

**Rule**: All new feature work goes on the `develop` branch. Vercel creates a preview deployment for every push to `develop` at a unique URL (e.g. `srintelligence-git-develop-...vercel.app`). Never commit directly to `main` during active development. When a feature is ready for production, merge `develop` → `main` — Vercel deploys automatically. Always run `npx tsc --noEmit` before merging to catch type errors that Turbopack dev mode silently ignores.

---

### 14. How to add a new intent with the clarification gate + auto-cohort pattern in `route-dispatcher.ts`

This is the pattern for any new intent in PATH B-AGENT that (a) requires prior cohort SQL that may not exist on a cold start, and (b) needs mandatory context (timeframe, product, geography) from the user before it can run. Follow these steps exactly:

**Step 1 — Add the intent check variable** (alongside the existing `isCausalIntent` line, ~line 1259):
```typescript
const isMyNewIntent = /^MY_NEW_INTENT/.test(intent);
```

**Step 2 — Write a `missingMyContext()` helper** (module-level, before the `RouteDispatcher` class):
```typescript
function missingMyContext(message: string): string[] {
  const missing: string[] = [];
  // Add checks for each required field:
  const hasX = /\bregex-for-X\b/i.test(message);
  if (!hasX) missing.push('x');
  return missing;
}
```
The existing `missingCausalContext()` helper is the reference — it checks for timeframe keywords via regex.

**Step 3 — Write a `buildMyContextClarificationPrompt()` helper** (module-level):
```typescript
function buildMyContextClarificationPrompt(missing: string[]): string {
  const parts: string[] = ['To run [intent name] I need a bit more context:'];
  if (missing.includes('x')) {
    parts.push('\n**[Field name]** — please specify ...');
  }
  return parts.join('\n');
}
```

**Step 4 — Write a `synthesizeMyContextQuestion()` helper** (module-level, only needed if auto-cohort applies):
```typescript
function synthesizeMyContextQuestion(message: string): string {
  // Strip intent-specific verbs, return a plain Cortex Analyst question
  const stripped = message.replace(/\b(intent-specific-words)\b/gi, '').trim();
  return `Show ... metrics for ${stripped || 'all products'}. Include the full timeframe specified.`;
}
```

**Step 5 — Insert the gate block** (inside `dispatchPathBAgent()`, after `const isCausalIntent = ...`):
```typescript
let autoCohortSQL: string | undefined;  // already declared if CAUSAL gate exists
let skipAgentCall = false;              // already declared if CAUSAL gate exists

if (isMyNewIntent && !lastSQL) {
  const missing = missingMyContext(message);
  if (missing.length > 0) {
    result = buildAgentResult(
      '', intent, agentName,
      buildMyContextClarificationPrompt(missing),
      undefined, null,
      Date.now() - startMs, randomUUID(),
    );
    skipAgentCall = true;
  } else {
    const cohortQ = synthesizeMyContextQuestion(message);
    try {
      const autoResp = await callCortexAnalyst({
        question: normalizeUserQuestion(cohortQ),
        semanticView: baseInput.semanticView.fullyQualifiedName,
        signal,
      });
      if (autoResp.sql && !autoResp.error) autoCohortSQL = autoResp.sql;
    } catch { /* swallow — agent will run without cohort context */ }
  }
}
```

**Step 6 — Verify `enrichMessage` uses `autoCohortSQL` as fallback** (already done for CAUSAL):
```typescript
const enriched = enrichMessage(resolvedMessage, intent, {
  priorSQL: lastSQL ?? autoCohortSQL ?? undefined,
  ...
});
```

**Step 7 — Verify the agent call is wrapped in `if (!skipAgentCall)`** (already done; just make sure your new gate shares the same `skipAgentCall` variable).

**Key invariants**: `skipAgentCall = true` must be set before `result = buildAgentResult(...)`. `autoCohortSQL` is used ONLY as a fallback — `lastSQL` (real prior session context) always wins.

---

### 15. SRI LinkedIn post format — template for SRIntelligence™ product marketing

Use this exact structure for any LinkedIn post promoting SRIntelligence™. The approved copy from June 2026 is the reference.

**Structure (in order):**
1. **Pain sentence** — one sentence naming the specific business problem. Must be directional ("often struggle to", "rarely have access to"), never absolute claims about what is "always" or "never" true.
2. **Product intro** — one sentence: `SRIntelligence™ — [2-3 word value prop]. Built on two decades of experience partnering with world's leading pharma and biotech firms.`
3. **Capability bullets** (5–7 lines) — each starts with `➡`. Cover: causal inference, ML algorithms, multi-source context (Rx data + CI + reports + transcripts), synthesized narrative, real-time answers. One bullet per distinct capability.
4. **The results? line** — `The results?` bold or standalone, followed by 2–3 outcome bullets. Outcomes must be directional (faster, earlier, clearer) not quantified unless data exists.
5. **Because… paragraph** — explains what makes this different: verified ML algorithms (not AI self-determining approach), auditability of all AI actions and decisions, operating within confines of validated and approved methods.
6. **CTA line** — `If you're looking to [outcome verb phrase], let's connect.`
7. **Hashtags** — 4–6 tags, mix of broad (`#pharmaanalytics`, `#commercialexcellence`) and specific (`#causalinference`, `#rxdata`).

**Tone rules**: Practitioner-to-practitioner, not vendor pitch. No jargon invented for effect. No invented metrics. Claims must be verifiable or directional. Avoid "revolutionary", "game-changing", "unprecedented".

---

### 16. `ForecastArtifact`: Non-date rows from agent responses sort to position 0 in `forecastRows`

**Error encountered**: A "13-Week Avg" summary row emitted by the forecast agent appeared as the first row in `forecastRows` because `sortByDate()` calls `dateKey()`, which returns `0` for unparseable strings. This caused three cascading problems:
1. The row appeared in the FORECAST table below the chart.
2. The visual bridge (applied to `forecastRows[0]`) targeted this phantom row instead of the first real forecast date, misplacing the connection point on the x-axis.
3. The CI band at this phantom row had `ciBase = 0`, making it render at the wrong y-position relative to the forecast line.

**Fix**: Filter out invalid-date rows inline when constructing `chartData` and `fTableRows` — do NOT modify `sortByDate` itself, as it is used elsewhere:
```typescript
// In chartData and fTableRows construction:
...forecastRows
  .filter(row => { const d = normaliseDate(row); return d.length > 0 && dateKey(d) > 0 })
  .map((row, idx) => { ... })
```

**Rule**: Any agent that emits a `forecastRows` table may include summary rows (averages, totals, notes) with non-date labels. Always filter these out at the chart/table construction site using `dateKey(normaliseDate(row)) > 0`. Do not rely on the agent to omit them.

---

### 17. `ForecastArtifact`: Bridge pattern for visual continuity between actuals and forecast lines

**Problem**: The actuals line (solid) and forecast line (dashed) visually disconnected at the handoff because the model's first predicted value differed from the last actual value. Adding a duplicate date row for the bridge caused a duplicate x-axis tick. Setting `SPLINE_LOOKBACK > 1` on the actuals series caused the CI band to start one point after the forecast line.

**Fix**: Three-part bridge applied at `forecastRows[0]` (after filtering invalid-date rows):
1. Set `SPLINE_LOOKBACK = 0` — no actual rows echo into the Forecast series.
2. At `idx === 0`, set `chartForecast = lastActualValue` — the dashed line starts at the last actual's y-value.
3. At `idx === 0`, set `chartCiBase = lastActualValue, chartCiSpan = undefined` — the CI band collapses to a point at the same origin, then expands normally from `idx === 1`.

```typescript
const lastActualRow = actualsRows[actualsRows.length - 1]
const lastActualValue = lastActualRow != null
  ? (normaliseActuals(lastActualRow) ?? normalisePredicted(lastActualRow))
  : undefined

// SPLINE_LOOKBACK = 0: no echoing of actuals into Forecast series

...validForecastRows.map((row, idx) => {
  const isBridge = idx === 0 && lastActualValue != null
  return {
    date: normaliseDate(row),
    Actuals: undefined,
    Forecast: isBridge ? lastActualValue : normalisePredicted(row),
    ciBase:   isBridge ? lastActualValue : normaliseLower(row),
    ciSpan:   isBridge ? undefined       : ciSpan,
  }
})
```

**Rule**: The bridge must override ALL chart-rendered values at the first forecast row — Forecast, ciBase, and ciSpan — or the CI band will be misaligned with the forecast line. Do not add a separate bridge data point (causes duplicate x-axis tick). Do not use `SPLINE_LOOKBACK > 0` with CI data (causes CI/line start offset).

---

### 18. `ForecastArtifact`: MAPE regex must cover all agent response formats

**Problem**: The MAPE regex only matched `"MAPE: 12.3%"`. The agent returned it in table format (`| MAPE | 12.3% |`), reversed order (`12.3% MAPE`), and spelled out (`Mean Absolute Percentage Error: 12.3%`), all of which returned `undefined` and caused "Reliability: Unknown".

**Fix** — five cascading patterns:
```typescript
const mapeRaw =
  text.match(/MAPE[^0-9]*([0-9]+\.?[0-9]*)\s*%/i)?.[1] ??
  text.match(/([0-9]+\.?[0-9]*)\s*%\s*MAPE/i)?.[1] ??
  text.match(/Mean\s+Absolute\s+Percentage\s+Error[^0-9]*([0-9]+\.?[0-9]*)\s*%?/i)?.[1] ??
  text.match(/\|\s*MAPE\s*\|\s*([0-9]+\.?[0-9]*)\s*%?/i)?.[1] ??
  text.match(/\|\s*([0-9]+\.?[0-9]*)\s*%\s*\|\s*MAPE/i)?.[1]
const mape = mapeRaw != null ? parseFloat(mapeRaw) : undefined
```

**Rule**: Always use cascading regex fallbacks for any numeric metric extracted from free-form agent text. The agent may change response format across model versions or query types. Test all five common orderings: `METRIC: value`, `value METRIC`, spelled-out label, Markdown table `| METRIC | value |`, reversed table `| value | METRIC |`.

---

### 19. `BriefBuilderModal`: Design-before-generate planning modal pattern

**Pattern**: A "Design Your Brief" planning modal that lets the user inspect, reorder, and remove inferred sections *before* triggering an expensive report generation API call. This puts the user in control and prevents wasted generation runs.

**Architecture**:
1. `planBriefSections(messages: AgentActivity[])` — pure function that derives section cards from the conversation context (detects forecast data, chart data, agent names, user questions, products, timeframes). Returns `BriefSection[]`.
2. Modal shows two-column layout (main column + sidebar) of draggable `SectionCard` components.
3. User reorders/removes/adds cards, then clicks "Build Brief" → `onBuild(sections)` callback triggers the API call.
4. Caller passes `approvedSections: sections` to the report API so the backend generates only what the user approved.

**Key implementation details**:
- `leadSentence(msg, userText)` must filter out technical database output lines: `/^Columns?:/i`, SQL keywords, lines with 3+ ALL_CAPS_SNAKE tokens. Users should see cohort intent, products, and timeframes — not SQL column names.
- `agentDesc(name, msg, userText)` builds specific per-agent descriptions that describe cohort definition and filters in plain English.
- Drag-and-drop uses HTML5 native API (`draggable`, `onDragStart`, `onDragOver`, `onDrop`). See Rule 20 below for the critical `e.stopPropagation()` fix.
- Use `WorkflowCard` and `app/chat/[threadId]/page.tsx` as the two call sites — both show the modal before triggering generation.

---

### 20. HTML5 drag-and-drop insertion indicator: `e.stopPropagation()` is required on card handlers

**Error encountered**: The insertion-line indicator (showing where a dragged card will land) always appeared at the bottom of the zone regardless of cursor position. `onDragOver` on the card elements was bubbling up to the DropZone container, which reset `overId = null`, always triggering the "insert at end" case.

**Fix**: Call `e.stopPropagation()` on every drag event handler on the card element, not just the DropZone:
```tsx
// SectionCard drag handlers — must stop propagation to prevent bubbling to DropZone
onDragOver={(e) => { e.stopPropagation(); onDragOver(e, col, sec.id); }}
onDrop={(e)     => { e.stopPropagation(); onDrop(e, col, sec.id); }}
```

**Rule**: In any drag-and-drop layout where cards sit inside a drop zone container, all drag events on the card must call `e.stopPropagation()`. Without it, the event fires on both the card and the container, and whichever handler runs last wins — usually the container, which clears the targeted insertion point.

---

### 21. SRI design system — brand tokens, masthead pattern, and cross-section consistency

**Context**: Every section page (Home, Chat, News, Workflows, Data) must share the same brand tokens, masthead structure, horizontal padding, and vertical start position so the app feels unified.

**Brand tokens** (define at top of each page/component):
```typescript
const INK    = "#1A3358";  // navy — all primary text and borders
const ACCENT = "#E26B2C";  // burnt orange — interactive elements, active states
const BG     = "#F5F5F5";  // warm off-white — page background
```

**Masthead pattern** (newspaper double-rule header):
```tsx
<div style={{ borderTop: `3px double ${INK}`, paddingTop: "5px" }}>
  <div style={{ borderTop: `1px solid ${INK}`, paddingTop: "4px", paddingBottom: "4px", textAlign: "center" }}>
    <span style={{
      fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
      fontSize: "12px", fontWeight: 800,
      letterSpacing: "0.38em", textTransform: "uppercase", color: INK,
    }}>
      Section Name
    </span>
  </div>
  <div style={{ borderTop: `1px solid ${INK}` }} />
</div>
```

**Consistency rules**:
- **Horizontal padding**: All section content wrappers use `px-6` (24px). Home and Chat previously used `px-10`; News/Workflows/Data used `px-5`. All must be `px-6`.
- **Vertical start**: All mastheads must appear at the same Y coordinate (95px from the top of the viewport in the current layout). Achieve this with `pt-4` on the outermost content container. Home/Chat had `pt-10` or `py-8` — both must be reduced to `pt-4`.
- **Masthead font**: `fontSize: "12px"` across all sections. The Home page masthead ("PHARMA INTELLIGENCE") was `10px` and needed updating.
- **Typography**: Manrope for headings/greetings, Nunito Sans for labels, masthead text, and UI chrome.

**Rule**: When adding a new section page, copy the masthead pattern above verbatim, use `px-6 pt-4` on the outer container, and verify the masthead renders at ~95px from viewport top before shipping.

---

### 22. Masthead with action button — center text using `position: relative` + `position: absolute`

**Problem**: Sections like News and Workflows need an action button (Refresh, + New Workflow) in the masthead row. Using `display: flex; justify-content: space-between` left-aligns the text instead of centering it.

**Fix**: Use `position: relative; text-align: center` on the row div, and `position: absolute; right: 0; top: 50%; transform: translateY(-50%)` on the button:
```tsx
<div style={{ borderTop: `1px solid ${INK}`, paddingTop: "5px", paddingBottom: "5px",
              position: "relative", textAlign: "center" }}>
  <span style={{ fontSize: "12px", fontWeight: 800, letterSpacing: "0.38em",
                 textTransform: "uppercase", color: INK, fontFamily: "..." }}>
    News Intelligence
  </span>
  <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}>
    {/* Refresh button or any action */}
  </div>
</div>
```

**Rule**: Never use `justify-content: space-between` in a masthead row where the title must be centered. Always use `position: relative` + `textAlign: center` on the container and `position: absolute; right: 0` on the action element. This decouples the text centering from the button placement.

---

### 23. Greeting above masthead on the home page — placement and sizing

**Pattern**: The home page shows a time-based greeting ("Good morning", "Good evening") above the newspaper masthead. This is specific to the Home section only; other sections put contextual text below the masthead in an "edition line".

**Implementation**:
```tsx
{/* Greeting — above masthead */}
<p className="mb-6 text-center" style={{
  fontFamily: "var(--font-manrope), system-ui, sans-serif",
  fontSize: "26px", fontWeight: 600, color: SRI.ink,
  letterSpacing: "-0.02em", minHeight: "1.6rem",
}}>
  {greeting ?? " "}
</p>

{/* Masthead immediately below */}
<div style={{ borderTop: `3px double ${SRI.ink}`, paddingTop: "5px" }}>
  ...
</div>
```

**Rule**: The greeting uses `mb-6` (24px bottom margin) to give breathing room before the masthead double-rule. Font is Manrope 26px semi-bold. The outer content container must use `pt-4` (not `py-8` or `pt-10`) so the greeting + masthead together still land at the correct vertical position. Do not duplicate the greeting in the edition line below the masthead.

---

### 24. Custom styled dropdown replacing native `<select>` — always-visible semantic view selector

**Problem**: Native `<select>` elements are styled by the OS and look completely out of place in a design-system-consistent UI. When the element is `disabled` (single option) it also becomes invisible with no border.

**Fix**: Replace `<select>` with a fully custom button + dropdown panel, using a `dropdownOpen` state and an outside-click handler:

```tsx
const [dropdownOpen, setDropdownOpen] = useState(false);
const dropdownRef = useRef<HTMLDivElement>(null);

// Outside-click closes dropdown
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
      setDropdownOpen(false);
  };
  document.addEventListener("mousedown", handler);
  return () => document.removeEventListener("mousedown", handler);
}, []);

// JSX
<div ref={dropdownRef} className="relative">
  <button
    onClick={() => setDropdownOpen(o => !o)}
    className="flex items-center gap-2 rounded-full px-3 py-1.5"
    style={{ border: `1px solid ${INK}30`, background: "#fff" }}
  >
    <Database size={12} style={{ color: `${INK}70` }} />
    <span style={{ fontSize: 13, fontWeight: 700, color: INK }}>
      {activeView ? getDisplayName(activeView) : "Select model"}
    </span>
    <ChevronDown size={12} style={{ transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }} />
  </button>

  {dropdownOpen && (
    <div className="absolute left-0 z-50 mt-1 rounded-xl overflow-hidden"
      style={{ minWidth: 260, background: "#fff", border: `1px solid ${INK}20`, boxShadow: `0 8px 24px ${INK}18` }}>
      {options.map((opt, i) => (
        <button key={opt.id} onClick={() => { onSelect(opt.id); setDropdownOpen(false); }}
          className="w-full text-left px-4 py-3 flex flex-col gap-0.5 hover:bg-black/5"
          style={{ borderBottom: i < options.length - 1 ? `1px solid ${INK}10` : "none",
                   background: opt.id === activeId ? `${INK}06` : "transparent" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: opt.id === activeId ? ACCENT : INK }}>
            {opt.label}
          </span>
          <span style={{ fontSize: 10, color: `${INK}55` }}>{opt.sublabel}</span>
        </button>
      ))}
    </div>
  )}
</div>
```

**Rule**: Never use a native `<select>` for a selector that appears in styled UI. Always use a custom button + portal/absolute dropdown with the `useRef` outside-click pattern. The chevron should rotate 180° when open (`transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)"`). Active option gets `ACCENT` color; inactive options get `INK`.

---

### 25. Document/Article card layout conversion — flat list with dividers, not bordered cards

**Error encountered**: Initial implementation of the Reports section used bounded card components (rounded borders, background), but the News articles section uses a cleaner flat list with just dividing lines between items.

**Fix**: Converted DocumentCard from a bounded card layout to a flat list item using:
```tsx
<div
  className="flex flex-col gap-2 py-4 px-5"
  style={{ borderBottom: `1px solid ${ink}35` }}  // Darker divider for visibility
>
```

**Rule**: When styling a scrollable list of items to match the News articles section, use flat cards with `borderBottom` dividers instead of bordered boxes. Use darker dividers (opacity 35%+) for clear visual separation. Spacing: `py-4 px-5` for consistent padding with articles section.

---

### 26. Large separator dots in eyebrow/footer — font size scaling vs alignment

**Error encountered**: Separator dots between metadata fields (Therapy Area · Indication · Brand) were initially 9px, making them nearly invisible. When increased to 50px for prominence, they became vertically misaligned with the surrounding text.

**Fix**: Use `fontSize: "50px"` with `display: "flex"` and `alignItems: "center"` on the dot span:
```tsx
<span style={{ 
  color: accent, 
  fontSize: "50px", 
  fontWeight: 700, 
  lineHeight: "0.6", 
  display: "flex", 
  alignItems: "center" 
}}>
  ·
</span>
```

**Rule**: Large separator dots need more than font size — they require flex display with vertical center alignment to stay visually aligned with surrounding text. Use `lineHeight: "0.6"` to compress the vertical space the dot occupies. Always use `fontWeight: 700` for prominence.

---

### 27. Filter dropdowns with multi-select — state management for multi-value filters

**Pattern**: Building filterable document lists with independent filter dropdowns (Therapy Area, Indication, Brand, Uploaded By, Date range).

**Implementation**:
1. **State**: Use `string[]` for multi-select filters, `number` for single-value (days):
```tsx
const [filterTherapyArea, setFilterTherapyArea] = useState<string[]>([]);
const [filterIndication, setFilterIndication] = useState<string[]>([]);
const [filterBrand, setFilterBrand] = useState<string[]>([]);
const [filterUploadedDays, setFilterUploadedDays] = useState(0);
const [openFilter, setOpenFilter] = useState<string | null>(null);
```

2. **Filter pills with dropdowns**:
```tsx
<div className="relative">
  <button onClick={() => setOpenFilter(openFilter === "therapy" ? null : "therapy")}
    style={{ background: filterTherapyArea.length > 0 ? "rgba(26,51,88,0.08)" : "rgba(26,51,88,0.04)" }}>
    Therapy Area {filterTherapyArea.length > 0 && `(${filterTherapyArea.length})`}
    <ChevronDown size={12} style={{ transform: openFilter === "therapy" ? "rotate(180deg)" : "rotate(0deg)" }} />
  </button>
  {openFilter === "therapy" && (
    <div style={{ position: "absolute", top: "100%", zIndex: 50 }}>
      {[...new Set(docsToDisplay.map(d => d.THERAPY_AREA).filter(Boolean))].map(area => (
        <button key={area} onClick={() => 
          setFilterTherapyArea(filterTherapyArea.includes(area as string) 
            ? filterTherapyArea.filter(a => a !== area) 
            : [...filterTherapyArea, area as string]
          )
        }>
          {filterTherapyArea.includes(area as string) ? "✓ " : ""}{area}
        </button>
      ))}
    </div>
  )}
</div>
```

3. **Filter logic in render**:
```tsx
const filteredDocs = docsToDisplay.filter((doc) => {
  if (!doc.FILE_NAME.toLowerCase().includes(searchQuery.toLowerCase())) return false;
  if (filterTherapyArea.length > 0 && !filterTherapyArea.includes(doc.THERAPY_AREA || "")) return false;
  if (filterIndication.length > 0 && !filterIndication.includes(doc.INDICATION || "")) return false;
  if (filterBrand.length > 0 && !filterBrand.includes(doc.BRAND || "")) return false;
  if (filterUploadedBy.length > 0 && !filterUploadedBy.includes(doc.UPLOAD_USER_ID)) return false;
  return true;
});
```

**Rule**: Use `[...new Set(...)]` to extract unique filter values from the data dynamically, avoiding hard-coded option lists. Show badge count `(N)` on active filters. Use checkmark prefix `✓` in dropdown options to indicate selected state. Lighter background for dropdown container when filters are active.


---

### 28. News filter bar — action buttons belong in the filter pill row, not the tab row

**Context**: The Articles/Sources/Health tab row is a navigation element. Putting a Refresh action button there conflates navigation with actions and creates visual clutter in a row that should only serve tab switching.

**Fix**: Move the Refresh (and Abort-scrape) button out of the tab row and into the filter pill row as the last element. This keeps the tab row clean and gives the action button proper context — it is an action on the filtered article feed, so it lives with the feed controls.

**Implementation**:
- Remove the button from the tab row div entirely
- Add it as the last child inside the filter bar div (after the Clear all button)
- Use `shrink-0` and a fixed `width/height` so it does not flex-grow or shrink into a pill



**Rule**: Tab rows contain only tab navigation. All actions that operate on the current tab's content belong in the content toolbar (filter bar), as the last element.

---

### 29. Sub-section toolbar row height must match the parent filter bar height

**Problem**: When a tab's content has its own sub-tabs (e.g., Sources has Active/Removed, Health has All/Broken/Overdue/Healthy), that sub-tab row often has a different height than the main filter pill bar, making the section feel visually inconsistent.

**Root cause**: The filter pill bar uses  (10px top + 10px bottom) on the container, with pills at . The sub-tab toolbars used only button-level padding (), resulting in a shorter 32px row vs the 44px filter bar.

**Fix**: Set  on the sub-tab container div, and reduce the button padding to  (from ). This gives:
- Container: 10px top + 10px bottom = 20px
- Button: text (~12px) + 8px button padding = ~20px  
- Total: ~40px — visually matching the filter bar

1px solid rgba(26,51,88,0.12)2px solid 

**Rule**: Any sub-tab toolbar that lives below a filter pill bar must use  on the container and  on the tab buttons to produce a matching row height.

---

### 30. Filter pill bar should use white background to visually separate it from content

**Problem**: When the filter bar uses the same  () as the content area, there is no visual distinction between the controls and the content. This is especially noticeable when articles scroll up behind the sticky filter row.

**Fix**: Set  on the filter bar container:
1px solid rgba(26,51,88,0.10)

**Rule**: Sticky filter/toolbar rows should use  (not BG) so they are visually distinct from the scrolling content and so the sticky header does not blend into article text when scrolled.

---

### 31. Filled action buttons vs. outline — when to use each

**Pattern established**: Icon-only circle buttons that trigger a primary action (Refresh/scrape, Add source) should use a filled background ( or danger red), not an outline style. This gives clear affordance that clicking causes a state change.

**Filled — use for**:
- Scrape refresh (burnt orange  fill, white icon)
- Abort in-progress scrape (red fill, white icon)
- Add new record (burnt orange fill, white )
- Any destructive or irreversible action

**Outline — use for**:
- Soft data reload (e.g., reload a list from DB, no side effects)
- Toggle/preference actions

**Rule**: A button that triggers an external side effect (network call, mutation) gets a filled ACCENT background. A button that only refreshes local display state gets an outline style. This visual language makes the distinction clear at a glance.

---

### 32. Dropdown item font size — minimum 13px for readability

**Error encountered**: Dropdown menus (Drug, Company, Doc type, Source, Sort) used  matching the filter pill labels. Inside a dropdown panel, 11px is too small to scan quickly — users reported difficulty reading the options.

**Fix**: Changed   from  to :
rgba(26,51,88,0.80)

**Rule**: Filter pill labels can use 10–11px (they are static, short, and scanned by position). Dropdown items must use at least 13px — the user is reading a list of options while making a selection decision, so readability matters more than compactness.

---

### 33. LangGraph test mock initialization — `vi.mock()` callback must define mocks before using them

**Error encountered**: Semantic chunker test failed with "Cannot access 'mockCreateMessage' before initialization" when `mockCreateMessage` variable was referenced inside a `vi.mock()` callback before being defined in module scope.

**Fix**: Moved `mockCreateMessage` definition inside the `vi.mock()` callback:
```typescript
// BEFORE (fails):
const mockCreateMessage = () => ({ content: [{ text: '[]' }] });
vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreateMessage }
  }
}));

// AFTER (works):
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreateMessage = async () => ({ content: [{ text: '[]' }] });
  return {
    default: class Anthropic {
      messages = { create: mockCreateMessage }
    }
  };
});
```

**Rule**: All mock variable definitions used in `vi.mock()` callbacks must be declared inside the callback, not in module scope. The callback executes before module-level code, so references to undefined variables fail. Keep mock setup self-contained within the `vi.mock()` function.

---

### 34. Test assertion mismatches with extractors — mock return values must exceed minimum thresholds

**Error encountered**: PDF, DOCX, PPTX extractor tests failed with assertions expecting `fullText.length > 100` but mock returns were too short (30-50 chars). Tests passed in dev but failed in CI due to type coercion differences.

**Fix**: Increased mock return values to exceed validation threshold:
```typescript
// BEFORE (fails validation):
const mockText = "Sample extracted text";

// AFTER (passes validation):
const mockText = "Sample extracted text from document. ".repeat(5);
// Now: 190+ chars, exceeds 100-char minimum
```

**Rule**: Any test with a minimum length/size validation must ensure mock return values exceed that threshold. Common thresholds: extracted text ≥100 chars, embeddings ≥768D, chunks ≥1. Check validator functions (density checks, extraction guards, embedding size asserts) before writing mocks.

---

### 35. Keyword extraction must exclude negation words — stopword filtering

**Error encountered**: Query router extracted "without", "not", "no", "avoid", "except" as keywords during negative phrasing analysis. These become zero-match search terms (no documents have "without" in fields), causing retrieval failures on queries like "drugs without side effects".

**Fix**: Added negation words to stopwords in `extractKeywords()`:
```typescript
const stopwords = new Set([
  "the", "a", "an", "is", "are", "and", "or", "in", "on", "at",
  "to", "for", "of", "with", "by", "from", "not", "no", "without",
  "avoid", "except"
  // ↑ negation words added
]);
```

**Rule**: Stopwords must include negation words ("not", "no", "without", "avoid", "except") since they indicate absence rather than presence. Query router should rewrite "find X without Y" → "find X with minimal Y" BEFORE keyword extraction, not after. Apply negation fixing as Phase 1 (rewrite), keyword extraction as Phase 2 (extract from rewritten query).

---

### 36. Boolean coercion in auto-enrichment — use `!!` to ensure boolean return

**Error encountered**: `autoEnrichMessage()` returned `undefined` (instead of `false`) for `hasDocuments` when documents were disabled. Code checking `if (result.hasDocuments)` passed unexpectedly because `undefined` is falsy but not `false`. Subsequent code treating it as boolean failed type check.

**Fix**: Added explicit boolean coercion in enrichment gate:
```typescript
// BEFORE (returns undefined):
const enableDocs = opts.enableDocuments !== false && opts.executeQuery && shouldEnableDocuments(intent);
// If opts.executeQuery is undefined, whole expression short-circuits to undefined

// AFTER (returns boolean):
const enableDocs = !!opts.enableDocuments !== false && !!opts.executeQuery && shouldEnableDocuments(intent);
// Now: true/false guarantee
```

**Rule**: Any expression that should return a boolean must use explicit coercion (`!!value`) if any operand could be `undefined`. This is especially important for state flags (`hasDocuments`, `isValid`, `skipAgentCall`) that downstream code relies on as boolean types. Return `const result: boolean` (not `boolean | undefined`).

---

### 37. Hybrid search RRF formula — k parameter prevents division by zero and ranks small result sets

**Pattern**: Reciprocal Rank Fusion (RRF) normalizes vector and keyword rankings to combine them fairly:
```
score = (0.6 * 1/(k + vector_rank)) + (0.4 * 1/(k + keyword_rank))
```

**Key insight**: The `k` parameter (typically 20) ensures:
1. **No division by zero** — rank 0 becomes `1/(20+0) = 0.05`, not undefined
2. **Fair ranking** — first result (rank 1) gets `0.049`, fifth result gets `0.033`; the gap is manageable
3. **Tail decay** — hundredth result gets `0.0091`, preventing low-rank results from dominating

**Rule**: Always set `k ≥ 10` in RRF (20 is standard). For small result sets (≤10 items), set `k = 10`; for larger sets (100+), set `k = 20`. Never set `k = 0` or `k = 1` (creates extreme rank differences). Test RRF formula against known result sets to ensure middle-ranked items aren't over-weighted.

---

### 38. 3-cycle agentic retry loop — query refinement must succeed and validation must improve

**Pattern**: Retrieval orchestrator retries up to 3 times if validation fails:
1. **Cycle 1**: Route original query → search → validate
2. **Cycle 2** (if invalid): Rewrite query (via agent) → search → validate
3. **Cycle 3** (if still invalid): Rewrite again → search → validate → return best attempt

**Critical rule**: Cycle N+1 must use **different search terms** than Cycle N, otherwise you search the same docs and get the same results.

**Fix**: Query refinement agent must rewrite, not paraphrase:
```typescript
// GOOD: Changes meaning to expand coverage
"original: clinical trial efficacy" → "rewritten: clinical trial safety adverse events"

// BAD: Just rephrases, same semantics
"original: clinical trial efficacy" → "rewritten: trial of drug effectiveness"
```

**Rule**: The query refinement prompt must instruct the agent to "expand the search focus" or "include related terms" — not "rephrase" or "clarify". If cycles 1-3 all use the same keywords, caching or vector similarity will return the same results. Max useful cycles is 3-4 before diminishing returns. Measure cycle effectiveness by tracking coverage/relevance score deltas per cycle.

---

### 39. Snowflake ARRAY type for embeddings — no native VECTOR type support in this account

**Error encountered**: SQL compilation error "Invalid data type [VECTOR(FLOAT, 768)]" when creating embedding column. User's Snowflake account does not support the VECTOR type (available only in specific regions/editions).

**Fix**: Changed schema from VECTOR to ARRAY:
```sql
-- BEFORE (fails):
EMBEDDING VECTOR(768),

-- AFTER (works):
EMBEDDING ARRAY,
```

**Workaround for retrieval**: Since native vector similarity functions don't work on ARRAY, use text matching + manual normalization:
```typescript
// Vector search fallback:
// If no VECTOR_COSINE_SIMILARITY, compute similarity in application
const similarity = cosineSimilarity(
  arrayToVector(row.EMBEDDING),
  queryVector
);
```

**Rule**: Check Snowflake account edition (Standard/Business Critical) and region before designing schema. VECTOR type is regional. Default to ARRAY for portability. If you must use vectors, implement cosine similarity in JavaScript using `Math.sqrt()` and dot product — acceptable for up to 1000 vectors per query, but slow for large result sets (>10k).

---

### 40. Document status lifecycle and Snowflake persistence — fail-open vs. status guarantees

**Pattern**: Document ingestion follows a status workflow:
- `pending` → extraction starts
- `extracted` → chunks created, ready for embedding
- `indexed` → embeddings persisted, searchable
- `failed` → error during processing

**Critical invariant**: If any persistence step fails, the document remains in `pending` state and is retried on next upload.

**Implementation**: Persist status transactionally:
```typescript
// Set status BEFORE each stage
await updateDocumentStatus(docId, 'extracted');
try {
  await generateEmbeddings(docId);
  await updateDocumentStatus(docId, 'indexed');
} catch (error) {
  // stays at 'extracted', can retry embedding generation later
  console.warn(`Embedding failed: ${error}`);
  // Fail-open: don't throw, let document stay queryable via keyword search
}
```

**Rule**: Use status codes as recovery anchors. If embedding fails, the document is still `extracted` and searchable by text. If Snowflake persistence fails, retry via background job (not in user request). Never leave a document in indeterminate state (e.g., partly persisted, status unknown). Always set status in database before and after each stage.

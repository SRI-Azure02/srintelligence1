/**
 * normalizeCortexSQL — fix known Cortex Analyst inference errors in generated SQL.
 *
 * Cortex Analyst reads column descriptions and infers human-readable filter
 * values, but the underlying tables may use abbreviations or non-standard date
 * formats.  This function patches the most common mismatches so that generated
 * SQL always uses the actual stored values.
 *
 * Used by both analyst-api.ts (PATH A, direct Cortex Analyst REST) and
 * route-dispatcher.ts (PATH B-CLUSTER, clustering input SQL generation).
 *
 * Normalizations applied (in order):
 *   1. brand_generic_indicator: 'Brand'/'Generic'/'Branded' → 'B'/'G' (equality + IN-lists)
 *   2. claim_status_code: 'Dispensed'/'Paid'/'Active'/'Filled' → '1'; 'Reversed'/'Rejected' → '2'
 *      Integer literals (= 1 / = 2) → quoted string form ('1' / '2')
 *   3. date_rx_filled TO_DATE / TRY_TO_DATE with wrong format → 'YYYYMMDD'
 *   4. date_rx_filled TRY_TO_DATE without format string → add 'YYYYMMDD'
 *   5. date_rx_filled DATE_PART('year',...) and YEAR() / EXTRACT() → LEFT(...,4)
 *   6. date_rx_filled ISO date comparisons → YYYYMMDD string comparisons
 *   7. US state full names → 2-letter abbreviations (equality AND IN-lists/CASE WHEN)
 *   8. brand_name human-readable → stored code ('Brand One' → 'BRAND1', etc.)
 *   9. product_name direct equality AND LOWER() wrapper → value normalisation
 *      (covers both CTE-style queries and SEMANTIC_VIEW() inline syntax)
 */

// ---------------------------------------------------------------------------
// US state full-name → abbreviation lookup (all 50 states + DC + territories)
// ---------------------------------------------------------------------------

const US_STATE_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI',
};

/**
 * Replace full US state names with 2-letter abbreviations anywhere they appear
 * as quoted string literals in the SQL — covers equality comparisons, IN() lists,
 * and CASE WHEN ... IN (...) region-mapping blocks.
 *
 * Guard: only applies when the SQL already references a known state column so
 * we don't accidentally rewrite legitimate non-state values like 'Georgia' in
 * a company name or 'Maine' in a product description.
 */
function normalizeStateNames(sql: string): string {
  const hasStateColumn =
    /\b(state(?:_code|_name|_abbr)?|physician_state|prescriber_state|hcp_state|provider_state)\b/i.test(sql);
  if (!hasStateColumn) return sql;

  // Replace every single-quoted string that exactly matches a US state full name.
  // This covers equality (= 'New Jersey'), IN-lists, and CASE WHEN IN (...) blocks.
  return sql.replace(/'([A-Z][a-zA-Z ]{2,29})'/g, (_match, value) => {
    const abbr = US_STATE_MAP[value.toLowerCase().trim()];
    return abbr ? `'${abbr}'` : _match;
  });
}

// ---------------------------------------------------------------------------
// Brand name normalisation
// Brand names are stored as 'BRAND1' … 'BRAND10' (uppercase, no space).
// Cortex Analyst may emit 'Brand One', 'Brand 1', 'Brand1', etc. via
// brand_name = '...' equality comparisons.
// ---------------------------------------------------------------------------

const BRAND_NAME_MAP: Record<string, string> = {
  'brand one': 'BRAND1',   'brand 1': 'BRAND1',   'brand1': 'BRAND1',
  'brand two': 'BRAND2',   'brand 2': 'BRAND2',   'brand2': 'BRAND2',
  'brand three': 'BRAND3', 'brand 3': 'BRAND3',   'brand3': 'BRAND3',
  'brand four': 'BRAND4',  'brand 4': 'BRAND4',   'brand4': 'BRAND4',
  'brand five': 'BRAND5',  'brand 5': 'BRAND5',   'brand5': 'BRAND5',
  'brand six': 'BRAND6',   'brand 6': 'BRAND6',   'brand6': 'BRAND6',
  'brand seven': 'BRAND7', 'brand 7': 'BRAND7',   'brand7': 'BRAND7',
  'brand eight': 'BRAND8', 'brand 8': 'BRAND8',   'brand8': 'BRAND8',
  'brand nine': 'BRAND9',  'brand 9': 'BRAND9',   'brand9': 'BRAND9',
  'brand ten': 'BRAND10',  'brand 10': 'BRAND10', 'brand10': 'BRAND10',
};

/**
 * Fix brand_name / market_name equality comparisons where Cortex Analyst used
 * a human-readable label instead of the stored code.
 */
function normalizeBrandNames(sql: string): string {
  return sql.replace(
    /\b(brand_name|market_name|product_brand_name)\s*=\s*'([^']{1,30})'/gi,
    (_match, col, value) => {
      const normalised = BRAND_NAME_MAP[value.toLowerCase().trim()];
      return normalised ? `${col} = '${normalised}'` : _match;
    },
  );
}

/**
 * Fix product_name comparisons where Cortex Analyst infers a human-readable
 * brand label instead of the stored code.
 *
 * product_name stores the brand code directly ('BRAND1', 'BRAND2', …) in both
 * the DRUG_TABLE CTE and the SEMANTIC_VIEW dimension.  Only the *value* needs
 * normalisation — the column name is always correct and must never be renamed.
 *
 *   product_name = 'brand one'              →  product_name = 'BRAND1'
 *   product_name = 'brand1'                 →  product_name = 'BRAND1'
 *   LOWER(dt.product_name) = LOWER('brand1')→  dt.product_name = 'BRAND1'
 */
function normalizeProductNameFilter(sql: string): string {
  // ── Direct equality: product_name = 'brand one' / 'brand1' / … ─────────
  let result = sql.replace(
    /((?:[\w.]+\.)?product_name)\s*=\s*'([^']{1,30})'/gi,
    (_match, col, value) => {
      const normalised = BRAND_NAME_MAP[value.toLowerCase().trim()];
      return normalised ? `${col} = '${normalised}'` : _match;
    },
  );

  // ── LOWER() wrapper: LOWER(dt.product_name) = LOWER('brand1') ───────────
  // Replace with a direct equality against the stored uppercase code.
  result = result.replace(
    /LOWER\s*\(\s*((?:[\w.]+\.)?product_name)\s*\)\s*=\s*LOWER\s*\(\s*'([^']{1,30})'\s*\)/gi,
    (_match, col, value) => {
      const normalised = BRAND_NAME_MAP[value.toLowerCase().trim()];
      return normalised ? `${col} = '${normalised}'` : _match;
    },
  );

  return result;
}

// ---------------------------------------------------------------------------
// date_rx_filled date / year filter normalisation
// date_rx_filled is stored as VARCHAR 'YYYYMMDD' (e.g. '20250101').
//
// Patterns emitted by Cortex Analyst:
//   TRY_TO_DATE(date_rx_filled)                             ← no format string
//   TO_DATE(date_rx_filled)                                 ← no format string
//   TRY_TO_DATE(date_rx_filled, 'YYYY-MM-DD')               ← wrong format
//   TO_DATE(date_rx_filled, 'YYYY-MM-DD')                   ← wrong format
//   YEAR(date_rx_filled) = 2025                             ← YEAR() on VARCHAR
//   EXTRACT(YEAR FROM date_rx_filled) = 2025                ← same
//   DATE_PART('year', TRY_TO_DATE(date_rx_filled)) = 2025   ← no/wrong format
//   DATE_PART('year', TO_DATE(date_rx_filled)) = 2025       ← no format string
//   DATE_PART('year', TO_DATE(date_rx_filled,'YYYYMMDD'))=2025 ← valid but complex
//   date_rx_filled >= '2025-01-01'                          ← ISO vs YYYYMMDD
//   date_rx_filled BETWEEN '2025-01-01' AND '2025-12-31'    ← ISO format
// ---------------------------------------------------------------------------

function normalizeDateFilters(sql: string): string {
  return sql
    // ── DATE_PART('year', {TO_DATE|TRY_TO_DATE}(date_rx_filled[, any_fmt])) ──
    // Rewrite the entire DATE_PART expression to LEFT(col::VARCHAR,4) before
    // the inner TO_DATE/TRY_TO_DATE patterns below run.  Catches all variants:
    //   no format string, wrong format, YYYYMMDD format.
    .replace(
      /\bDATE_PART\s*\(\s*'year'\s*,\s*(?:TRY_TO_DATE|TO_DATE)\s*\(\s*((?:[\w.]+\.)?date_rx_filled)(?:::[Vv][Aa][Rr][Cc][Hh][Aa][Rr])?(?:\s*,\s*'[^']*')?\s*\)\s*\)\s*(=|!=|<>|>=|<=|>|<)\s*(\d{4})\b/gi,
      (_m, col, op, yr) => `LEFT(${col}::VARCHAR, 4) ${op} '${yr}'`,
    )

    // ── TRY_TO_DATE / TO_DATE with wrong dash-separated format string ────────
    .replace(
      /\bTO_DATE\s*\(\s*((?:[\w.]+\.)?date_rx_filled)\s*,\s*'[Yy]{4}-[Mm]{2}-[Dd]{2}'\s*\)/g,
      "TRY_TO_DATE($1::VARCHAR, 'YYYYMMDD')",
    )
    .replace(
      /\bTRY_TO_DATE\s*\(\s*((?:[\w.]+\.)?date_rx_filled)\s*,\s*'[Yy]{4}-[Mm]{2}-[Dd]{2}'\s*\)/g,
      "TRY_TO_DATE($1::VARCHAR, 'YYYYMMDD')",
    )

    // ── TO_DATE(date_rx_filled) with NO format string ────────────────────────
    // Snowflake auto-detect cannot reliably parse 'YYYYMMDD' VARCHAR values.
    .replace(
      /\bTO_DATE\s*\(\s*((?:[\w.]+\.)?date_rx_filled)\s*\)/g,
      "TRY_TO_DATE($1::VARCHAR, 'YYYYMMDD')",
    )

    // ── TRY_TO_DATE(date_rx_filled) with NO format string ───────────────────
    .replace(
      /\bTRY_TO_DATE\s*\(\s*((?:[\w.]+\.)?date_rx_filled)\s*\)/g,
      "TRY_TO_DATE($1::VARCHAR, 'YYYYMMDD')",
    )

    // ── DATE_PART('year', TRY_TO_DATE(date_rx_filled, 'YYYYMMDD')) = NNNN ────
    // Catches any remaining DATE_PART after the TRY_TO_DATE fixes above.
    .replace(
      /\bDATE_PART\s*\(\s*'year'\s*,\s*TRY_TO_DATE\s*\(\s*((?:[\w.]+\.)?date_rx_filled)(?:::[Vv][Aa][Rr][Cc][Hh][Aa][Rr])?\s*,\s*'YYYYMMDD'\s*\)\s*\)\s*(=|!=|<>|>=|<=|>|<)\s*(\d{4})\b/g,
      (_m, col, op, yr) => `LEFT(${col}::VARCHAR, 4) ${op} '${yr}'`,
    )

    // ── YEAR(date_rx_filled) = NNNN  ────────────────────────────────────────
    .replace(
      /\bYEAR\s*\(\s*((?:[\w.]+\.)?date_rx_filled)\s*\)\s*(=|!=|<>|>=|<=|>|<)\s*(\d{4})\b/gi,
      (_m, col, op, yr) => `LEFT(${col}::VARCHAR, 4) ${op} '${yr}'`,
    )

    // ── EXTRACT(YEAR FROM date_rx_filled) = NNNN  ───────────────────────────
    .replace(
      /\bEXTRACT\s*\(\s*YEAR\s+FROM\s+((?:[\w.]+\.)?date_rx_filled)\s*\)\s*(=|!=|<>|>=|<=|>|<)\s*(\d{4})\b/gi,
      (_m, col, op, yr) => `LEFT(${col}::VARCHAR, 4) ${op} '${yr}'`,
    )

    // ── date_rx_filled BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'  ───────────────
    .replace(
      /\b((?:[\w.]+\.)?date_rx_filled)\s+BETWEEN\s+'(\d{4})-(\d{2})-(\d{2})'\s+AND\s+'(\d{4})-(\d{2})-(\d{2})'/gi,
      (_m, col, y1, m1, d1, y2, m2, d2) =>
        `${col}::VARCHAR BETWEEN '${y1}${m1}${d1}' AND '${y2}${m2}${d2}'`,
    )

    // ── date_rx_filled >= / <= / > / < / = 'YYYY-MM-DD'  ───────────────────
    .replace(
      /\b((?:[\w.]+\.)?date_rx_filled)\s*(=|!=|<>|>=|<=|>|<)\s*'(\d{4})-(\d{2})-(\d{2})'/gi,
      (_m, col, op, y, mo, d) => `${col}::VARCHAR ${op} '${y}${mo}${d}'`,
    );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function normalizeCortexSQL(sql: string): string {
  return [
    // 1. brand_generic_indicator abbreviations — equality and IN-list forms
    (s: string) => s
      // Direct equality: = 'Brand' / = 'Generic' (all case variants)
      .replace(/\bbrand_generic_indicator\s*=\s*'Brand'/gi,    "brand_generic_indicator = 'B'")
      .replace(/\bbrand_generic_indicator\s*=\s*'Generic'/gi,  "brand_generic_indicator = 'G'")
      .replace(/\bbrand_generic_indicator\s*=\s*'Branded'/gi,  "brand_generic_indicator = 'B'")
      .replace(/\bbrand_generic_indicator\s*=\s*'branded'/gi,  "brand_generic_indicator = 'B'")
      // IN-list members: IN ('Brand', ...) / IN ('Generic', ...)
      // Replace the human-readable label inside any IN() with the stored code.
      .replace(/'Brand'\s*(?=[,)])/gi,   "'B'")
      .replace(/'Generic'\s*(?=[,)])/gi, "'G'")
      .replace(/'Branded'\s*(?=[,)])/gi, "'B'"),

    // 2. claim_status_code: human-readable labels → stored numeric-string codes
    // The column is VARCHAR; stored values are '1' (dispensed/paid) and '2' (reversed).
    (s: string) => s
      .replace(/\bclaim_status_code\s*=\s*'Dispensed'/gi, "claim_status_code = '1'")
      .replace(/\bclaim_status_code\s*=\s*'Paid'/gi,      "claim_status_code = '1'")
      .replace(/\bclaim_status_code\s*=\s*'Active'/gi,    "claim_status_code = '1'")
      .replace(/\bclaim_status_code\s*=\s*'Filled'/gi,    "claim_status_code = '1'")
      .replace(/\bclaim_status_code\s*=\s*'Reversed'/gi,  "claim_status_code = '2'")
      .replace(/\bclaim_status_code\s*=\s*'Rejected'/gi,  "claim_status_code = '2'")
      // Integer literal without quotes: = 1 / = 2 — cast to string form
      .replace(/\bclaim_status_code\s*=\s*1\b/g,  "claim_status_code = '1'")
      .replace(/\bclaim_status_code\s*=\s*2\b/g,  "claim_status_code = '2'"),

    // 3–6. date_rx_filled normalisation (TRY_TO_DATE format, YEAR(), DATE_PART, ISO comparisons)
    normalizeDateFilters,

    // 7. US state names → abbreviations (equality + IN-lists + CASE WHEN)
    normalizeStateNames,

    // 8. brand_name equality comparisons
    normalizeBrandNames,

    // 9. product_name direct equality AND LOWER() wrapper → value normalisation
    //    (covers both CTE-style queries and SEMANTIC_VIEW() inline syntax)
    normalizeProductNameFilter,
  ].reduce((s, fn) => fn(s), sql);
}

// ---------------------------------------------------------------------------
// Question pre-processor
// ---------------------------------------------------------------------------

/**
 * normalizeUserQuestion — rewrite human-readable brand / indicator references
 * in the user's natural-language question before it is sent to Cortex Analyst.
 *
 * Cortex Analyst reads the question literally.  When users say "brand one" or
 * "brand1" it doesn't know that the stored brand identifier is 'BRAND1'.
 * Similarly "brand drugs" or "branded" may confuse the brand_generic_indicator
 * mapping.  Pre-substituting the canonical stored values gives Cortex the exact
 * token it needs to generate correct SQL filters.
 *
 * Substitutions (case-insensitive, whole-word / phrase matches only):
 *   "brand one" / "brand 1" / "brand1"   → BRAND1
 *   "brand two" / "brand 2" / "brand2"   → BRAND2
 *   …up to BRAND10…
 *   "brand drugs" / "branded"            → brand_generic_indicator = 'B'  (hint)
 *   "generic drugs" / "generics"         → brand_generic_indicator = 'G'  (hint)
 */
export function normalizeUserQuestion(question: string): string {
  let q = question;

  // ── Named brand aliases → stored code with explicit column hint  ──────────
  // Including "product_name = 'BRANDn'" in the substitution tells Cortex
  // exactly which column to filter on, preventing it from falling back to the
  // brand_generic_indicator column when it sees the code 'BRANDn'.
  const brandPhraseMap: Array<[RegExp, string]> = [
    [/\bbrand\s*ten\b|\bbrand\s*10\b/gi,   "BRAND10 (product_name = 'BRAND10')"],
    [/\bbrand\s*one\b|\bbrand\s*1\b/gi,    "BRAND1 (product_name = 'BRAND1')"],
    [/\bbrand\s*two\b|\bbrand\s*2\b/gi,    "BRAND2 (product_name = 'BRAND2')"],
    [/\bbrand\s*three\b|\bbrand\s*3\b/gi,  "BRAND3 (product_name = 'BRAND3')"],
    [/\bbrand\s*four\b|\bbrand\s*4\b/gi,   "BRAND4 (product_name = 'BRAND4')"],
    [/\bbrand\s*five\b|\bbrand\s*5\b/gi,   "BRAND5 (product_name = 'BRAND5')"],
    [/\bbrand\s*six\b|\bbrand\s*6\b/gi,    "BRAND6 (product_name = 'BRAND6')"],
    [/\bbrand\s*seven\b|\bbrand\s*7\b/gi,  "BRAND7 (product_name = 'BRAND7')"],
    [/\bbrand\s*eight\b|\bbrand\s*8\b/gi,  "BRAND8 (product_name = 'BRAND8')"],
    [/\bbrand\s*nine\b|\bbrand\s*9\b/gi,   "BRAND9 (product_name = 'BRAND9')"],
  ];

  for (const [pattern, code] of brandPhraseMap) {
    q = q.replace(pattern, code);
  }

  // ── Brand/Generic indicator clarification  ─────────────────────────────────
  // Replace loose "brand drugs"/"branded" phrasing with an explicit hint so
  // Cortex maps it to the brand_generic_indicator column correctly.
  q = q
    .replace(/\bbrand(?:ed)?\s+drug(?:s)?\b/gi, "brand drugs (brand_generic_indicator = 'B')")
    .replace(/\bgeneric\s+drug(?:s)?\b/gi,       "generic drugs (brand_generic_indicator = 'G')")
    .replace(/\bgenerics\b/gi,                   "generics (brand_generic_indicator = 'G')");

  // ── Region breakdown  ────────────────────────────────────────────────────
  // The semantic model has no 'region' dimension.  Expand any region reference
  // with the explicit state→region mapping so Cortex can build a CASE WHEN
  // using physician_state.
  const REGION_HINT =
    "(use physician_state with this grouping — " +
    "North East: CT, ME, MA, NH, RI, VT, NJ, NY, PA; " +
    "Midwest: IL, IN, MI, OH, WI, IA, KS, MN, MO, NE, ND, SD; " +
    "West: AZ, CO, NV, NM, UT, WY, AK, CA, HI, OR, WA; " +
    "South: DE, FL, GA, MD, NC, SC, VA, WV, AL, KY, MS, TN, AR, LA, OK, TX; " +
    "all others: Other)";

  q = q.replace(
    /\bby\s+region\b|\bregional\s+breakdown\b|\bbreak(?:\s+it)?\s+down\s+by\s+region\b|\bregion(?:al)?\s+breakdown\b/gi,
    `by region ${REGION_HINT}`,
  );

  // Also handle standalone "region" when it appears as the main grouping dimension
  q = q.replace(
    /\bgroup(?:ed)?\s+by\s+region\b/gi,
    `grouped by region ${REGION_HINT}`,
  );

  return q;
}

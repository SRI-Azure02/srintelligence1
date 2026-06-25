"use client";

export interface NewsArticle {
  ARTICLE_ID:          string;
  SOURCE_ID:           string;
  SOURCE_NAME:         string;
  SOURCE_COMPANY:      string | null;
  SOURCE_CATEGORY:     string;
  TITLE:               string;
  SUMMARY:             string | null;
  CANONICAL_URL:       string | null;
  AUTHOR:              string | null;
  PUBLISHED_AT:        string | null;
  SCRAPED_AT:          string | null;
  ARTICLE_TYPE:        string | null;
  FILING_TYPE:         string | null;
  TAGS:                unknown[];
  COMPANIES_MENTIONED: unknown[];
  DRUG_NAMES:          string[];
  FEEDBACK_SCORE:      number;
  FEEDBACK_MULTIPLIER: number | null;
  AGE_DAYS:            number;
  COMPUTED_WEIGHT:     number;
}

interface Props {
  article:      NewsArticle;
  userId?:      string;
  activeDrugs?: string[];
  onDrugClick?: (drug: string) => void;
}

const CAT_COLOR: Record<string, string> = {
  regulatory:    "#E26B2C",
  filings:       "#1A3358",
  industry_news: "#059669",
  ir:            "#7c3aed",
  media:         "#0d7490",
};

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ArticleCard({ article, activeDrugs = [], onDrugClick }: Props) {
  const accentColor = CAT_COLOR[article.SOURCE_CATEGORY] ?? "#1A3358";

  return (
    <div
      className="flex flex-col gap-1.5 py-3.5 px-5"
      style={{ borderBottom: "1px solid rgba(26,51,88,0.22)" }}
    >
      {/* Byline row: source name · date · article type */}
      <div className="flex items-center gap-2">
        <span style={{
          fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
          fontSize: "9px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.14em",
          color: accentColor,
        }}>
          {article.SOURCE_NAME}
        </span>
        {article.PUBLISHED_AT && (
          <>
            <span style={{ color: "rgba(26,51,88,0.3)", fontSize: "9px" }}>·</span>
            <span style={{
              fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
              fontSize: "9px", color: "rgba(26,51,88,0.45)",
            }}>
              {formatDate(article.PUBLISHED_AT)}
            </span>
          </>
        )}
        {article.ARTICLE_TYPE && (
          <span style={{
            marginLeft: "auto",
            fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
            fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
            color: "rgba(26,51,88,0.35)",
          }}>
            {article.ARTICLE_TYPE}
          </span>
        )}
      </div>

      {/* Headline */}
      <a
        href={article.CANONICAL_URL ?? "#"}
        target="_blank"
        rel="noopener noreferrer"
        className="leading-snug hover:opacity-70 transition-opacity"
        style={{
          fontFamily: "var(--font-manrope), system-ui, sans-serif",
          fontSize: "14px", fontWeight: 700,
          color: "#1A3358",
        }}
      >
        {article.TITLE}
      </a>

      {/* Summary */}
      {article.SUMMARY && (
        <p className="line-clamp-2" style={{
          fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
          fontSize: "13px", lineHeight: "1.55",
          color: "rgba(26,51,88,0.58)",
        }}>
          {article.SUMMARY}
        </p>
      )}

      {/* Drug tags */}
      {article.DRUG_NAMES.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-0.5">
          {article.DRUG_NAMES.map((drug) => {
            const isActive = activeDrugs.includes(drug);
            return (
              <button
                key={drug}
                onClick={() => onDrugClick?.(drug)}
                className="transition-colors"
                style={{
                  padding: "1px 8px",
                  borderRadius: "999px",
                  fontSize: "9px", fontWeight: 700,
                  fontFamily: "var(--font-nunito-sans), system-ui, sans-serif",
                  letterSpacing: "0.05em", textTransform: "uppercase",
                  background: isActive ? "rgba(13,116,144,0.12)" : "rgba(26,51,88,0.06)",
                  color:      isActive ? "#0d7490"               : "rgba(26,51,88,0.45)",
                  border:     isActive ? "1px solid rgba(13,116,144,0.28)" : "1px solid transparent",
                }}
              >
                {drug}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

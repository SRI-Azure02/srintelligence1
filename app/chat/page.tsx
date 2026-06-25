"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import ChatInput from "@/components/chat/ChatInput";

const INK    = "#1A3358";
const ACCENT = "#E26B2C";
const BG     = "#F5F5F5";

const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='200' height='200' filter='url(#g)' opacity='1'/></svg>`;
const GRAIN_URL = `url("data:image/svg+xml,${encodeURIComponent(GRAIN_SVG)}")`;

function newThreadId() {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const SUGGESTED_PROMPTS: { category: string; color: string; prompts: string[] }[] = [
  {
    category: "Analytics",
    color: "#2891DA",
    prompts: [
      "What are the top 10 prescribers by total Rx volume in Q4 2025?",
      "Show market share by brand for oncology drugs in H2 2025",
    ],
  },
  {
    category: "Causal",
    color: "#8b5cf6",
    prompts: [
      "What causal factors drove the increase in Rx volume for Palbociclib in H2 2025?",
      "Estimate the lift from detailing visits on prescribing behavior in Q3 2025",
    ],
  },
  {
    category: "Forecast",
    color: "#34c98b",
    prompts: [
      "Forecast Rx volume for Pembrolizumab for the next 13 weeks",
      "Predict monthly claims for specialty plans in H1 2026",
    ],
  },
  {
    category: "Clustering",
    color: "#fb923c",
    prompts: [
      "Segment physicians into 4 clusters based on prescribing patterns in 2025",
      "Identify patient cohorts by drug utilization and plan type",
    ],
  },
];

export default function ChatHome() {
  const router = useRouter();

  const handleSubmit = useCallback((query: string) => {
    const id = newThreadId();
    sessionStorage.setItem(`pendingQuery:${id}`, query);
    router.push(`/chat/${id}`);
  }, [router]);

  const handlePlan = useCallback((query: string) => {
    const id = newThreadId();
    sessionStorage.setItem(`pendingPlan:${id}`, query);
    router.push(`/chat/${id}`);
  }, [router]);

  return (
    <div className="relative flex flex-col h-full" style={{ background: BG }}>
      {/* Noise texture */}
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: GRAIN_URL, backgroundRepeat: "repeat", backgroundSize: "200px 200px", opacity: 0.22, pointerEvents: "none", zIndex: 0 }} />

      {/* Content — masthead at top, prompt bar at bottom */}
      <div className="relative z-10 flex flex-col h-full px-6 pt-4">

        {/* Masthead */}
        <div style={{ borderTop: `3px double ${INK}`, paddingTop: "5px" }}>
          <div style={{ borderTop: `1px solid ${INK}`, paddingTop: "4px", paddingBottom: "4px", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontSize: "12px", fontWeight: 800, letterSpacing: "0.38em", textTransform: "uppercase", color: INK }}>
              Ask
            </span>
          </div>
          <div style={{ borderTop: `1px solid ${INK}` }} />
        </div>

        {/* Suggested prompts — fills remaining space */}
        <div className="flex-1 overflow-auto py-6">
          <div className="max-w-3xl mx-auto grid grid-cols-2 gap-3">
            {SUGGESTED_PROMPTS.map(({ category, color, prompts }) => (
              <div key={category} className="flex flex-col gap-2 p-4 rounded-xl"
                style={{ background: "#ffffff", border: `1px solid ${INK}12` }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-1"
                  style={{ color, letterSpacing: "0.14em", fontFamily: "var(--font-nunito-sans), system-ui, sans-serif" }}>
                  {category}
                </p>
                {prompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSubmit(p)}
                    className="text-left text-sm leading-snug hover:underline transition-colors"
                    style={{ color: INK, fontFamily: "var(--font-nunito-sans), system-ui, sans-serif", fontWeight: 500 }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Prompt bar — pinned to bottom */}
        <div className="pb-6 max-w-3xl mx-auto w-full">
          <ChatInput
            placeholder="Ask your question…"
            onSubmit={handleSubmit}
            onPlan={handlePlan}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { X, Keyboard, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Shortcut {
  keys: string[][];
  description: string;
}

// ── Shortcut definitions ──────────────────────────────────────────────────────

const GLOBAL: Shortcut[] = [
  { keys: [["?"]], description: "Open / close this panel" },
  { keys: [["G", "C"]], description: "Go to Chat" },
  { keys: [["G", "W"]], description: "Go to My Workflows" },
  { keys: [["G", "D"]], description: "Go to Data Explore" },
  { keys: [["Esc"]], description: "Close any open panel or modal" },
];

const CHAT: Shortcut[] = [
  { keys: [["Enter"]], description: "Send message" },
  { keys: [["⌘ ⇧ Enter"], ["^ ⇧ Enter"]], description: "Plan mode" },
  { keys: [["↑"], ["↓"]], description: "Cycle message history" },
  { keys: [["Tab"]], description: "Jump to next template field" },
  { keys: [["/"]], description: "Open agent picker" },
  { keys: [["//"]], description: "Open semantic model picker" },
  { keys: [[".."]], description: "Open feature column picker" },
  { keys: [["⌘ K"], ["^ K"]], description: "Focus chat input" },
];

const WORKFLOWS: Shortcut[] = [
  { keys: [["/"]], description: "Focus search bar" },
  { keys: [["Esc"]], description: "Clear search / blur" },
  { keys: [["N"]], description: "New workflow" },
  { keys: [["1"]], description: "Switch to grid view" },
  { keys: [["2"]], description: "Switch to list view" },
];

const CANVAS: Shortcut[] = [
  { keys: [["R"]], description: "Run / abort workflow" },
  { keys: [["⌘ S"], ["^ S"]], description: "Save workflow" },
  { keys: [["⌘ Z"], ["^ Z"]], description: "Undo" },
  { keys: [["⌘ ⇧ Z"], ["^ ⇧ Z"]], description: "Redo" },
  { keys: [["Del"], ["⌫"]], description: "Delete selected node or edge" },
  { keys: [["Esc"]], description: "Close panel / deselect node" },
];

const DATA_EXPLORE: Shortcut[] = [
  { keys: [["/"]], description: "Focus table search" },
  { keys: [["Esc"]], description: "Clear search / blur" },
  { keys: [["↑"], ["↓"]], description: "Navigate table list" },
  { keys: [["Enter"]], description: "Select focused table" },
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function KeyCombo({ combo }: { combo: string[] }) {
  return (
    <span className="flex items-center gap-0.5">
      {combo.map((key, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold"
          style={{
            background: "var(--bg-tertiary)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            minWidth: 22,
            whiteSpace: "nowrap",
            boxShadow: "0 1px 0 var(--border)",
          }}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutRow({ shortcut }: { shortcut: Shortcut }) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-1.5"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {shortcut.description}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {shortcut.keys.map((combo, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
            )}
            {combo.length === 1 ? (
              <KeyCombo combo={[combo[0]]} />
            ) : (
              <span className="flex items-center gap-1">
                {combo.map((k, ki) => (
                  <span key={ki} className="flex items-center gap-1">
                    <KeyCombo combo={[k]} />
                    {ki < combo.length - 1 && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>→</span>
                    )}
                  </span>
                ))}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Collapsible section ───────────────────────────────────────────────────────

function Section({
  title,
  shortcuts,
  accent = false,
  defaultOpen = false,
  nested = false,
  children,
}: {
  title: string;
  shortcuts: Shortcut[];
  accent?: boolean;
  defaultOpen?: boolean;
  nested?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        borderRadius: nested ? 6 : 8,
        border: `1px solid ${accent && open ? "rgba(40,145,218,0.3)" : "var(--border)"}`,
        overflow: "hidden",
        marginLeft: nested ? 0 : undefined,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between transition-colors hover:bg-black/4"
        style={{
          padding: nested ? "7px 10px" : "9px 12px",
          background: accent && open
            ? "rgba(40,145,218,0.07)"
            : "var(--bg-secondary)",
          textAlign: "left",
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-semibold uppercase tracking-widest shrink-0"
            style={{
              color: accent ? "var(--accent)" : "var(--text-muted)",
              letterSpacing: "0.09em",
              fontSize: nested ? "10px" : undefined,
            }}
          >
            {title}
          </span>
          {accent && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0"
              style={{ background: "rgba(40,145,218,0.12)", color: "var(--accent)" }}
            >
              current page
            </span>
          )}
          {!open && (
            <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
              {shortcuts.length + (children ? 1 : 0)} shortcut{shortcuts.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <ChevronDown
          size={nested ? 11 : 13}
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.18s ease",
            flexShrink: 0,
          }}
        />
      </button>

      {/* Body */}
      {open && (
        <div
          className="px-3"
          style={{ borderTop: `1px solid ${accent ? "rgba(40,145,218,0.15)" : "var(--border)"}` }}
        >
          {shortcuts.map((s, i) => (
            <ShortcutRow key={i} shortcut={s} />
          ))}
          {/* Nested children (e.g. Canvas inside Workflows) */}
          {children && (
            <div className="py-2">
              {children}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const pathname = usePathname() ?? "";

  const isChat        = pathname.startsWith("/chat");
  const isWorkflows   = pathname === "/workflows";
  const isCanvas      = pathname.includes("/edit");
  const isDataExplore = pathname.startsWith("/data-explore");

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 500, maxHeight: "82vh", background: "#ffffff", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={15} style={{ color: "var(--accent)" }} />
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Keyboard Shortcuts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <kbd
              className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              ?
            </kbd>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-black/5 transition-colors"
              style={{ color: "var(--text-muted)" }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body — fixed order: Global → Chat → Workflows+Canvas → Data Explore */}
        <div className="overflow-y-auto flex-1 px-4 py-3 flex flex-col gap-2">

          {/* 1. Global — always first, always expanded */}
          <Section title="Global" shortcuts={GLOBAL} defaultOpen />

          {/* 2. Chat */}
          <Section
            title="Chat"
            shortcuts={CHAT}
            accent={isChat}
            defaultOpen={isChat}
          />

          {/* 3. Workflows — expanded if on workflows or canvas; Canvas nested inside */}
          <Section
            title="Workflows"
            shortcuts={WORKFLOWS}
            accent={isWorkflows}
            defaultOpen={isWorkflows || isCanvas}
          >
            <Section
              title="Canvas"
              shortcuts={CANVAS}
              accent={isCanvas}
              defaultOpen={isCanvas}
              nested
            />
          </Section>

          {/* 4. Data Explore */}
          <Section
            title="Data Explore"
            shortcuts={DATA_EXPLORE}
            accent={isDataExplore}
            defaultOpen={isDataExplore}
          />
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2.5 shrink-0 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Shortcuts marked{" "}
            <kbd className="px-1 rounded text-xs font-mono"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>⌘</kbd>{" "}
            use{" "}
            <kbd className="px-1 rounded text-xs font-mono"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>Ctrl</kbd>{" "}
            on Windows
          </p>
          <button
            onClick={onClose}
            className="text-xs px-2.5 py-1 rounded-lg transition-colors hover:bg-black/5"
            style={{ color: "var(--text-muted)" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

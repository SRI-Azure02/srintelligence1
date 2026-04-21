"use client";

import { X, Keyboard } from "lucide-react";
import { usePathname } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Shortcut {
  keys: string[][];  // each inner array is one key combo; multiple = alternatives
  description: string;
}

// ── Shortcut definitions ──────────────────────────────────────────────────────

const GLOBAL: Shortcut[] = [
  { keys: [["?"]], description: "Open / close this panel" },
  { keys: [["G", "C"]], description: "Go to Chat" },
  { keys: [["G", "W"]], description: "Go to My Workflows" },
  { keys: [["G", "D"]], description: "Go to Data Explore" },
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

const PAGE_SECTIONS: Record<string, { label: string; shortcuts: Shortcut[] }> = {
  chat:      { label: "Chat",             shortcuts: CHAT },
  workflows: { label: "My Workflows",     shortcuts: WORKFLOWS },
  canvas:    { label: "Workflow Canvas",  shortcuts: CANVAS },
};

// ── Shared sub-components ─────────────────────────────────────────────────────

/** Renders one or two key-combo alternatives for a shortcut. */
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
    <div className="flex items-center justify-between gap-3 py-1.5"
      style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {shortcut.description}
      </span>
      <div className="flex items-center gap-1.5 shrink-0">
        {shortcut.keys.map((combo, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>or</span>
            )}
            {/* For G → C style sequences, render with "then" between keys */}
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

function Section({
  title,
  shortcuts,
  accent,
}: {
  title: string;
  shortcuts: Shortcut[];
  accent?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: accent ? "var(--accent)" : "var(--text-muted)", letterSpacing: "0.09em" }}
        >
          {title}
        </p>
        {accent && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full font-medium"
            style={{ background: "rgba(40,145,218,0.1)", color: "var(--accent)" }}
          >
            current page
          </span>
        )}
      </div>
      <div>
        {shortcuts.map((s, i) => (
          <ShortcutRow key={i} shortcut={s} />
        ))}
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export default function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  const pathname = usePathname() ?? "";

  // Determine current page context
  const contextKey = pathname.includes("/edit")
    ? "canvas"
    : pathname === "/workflows"
    ? "workflows"
    : pathname.startsWith("/chat")
    ? "chat"
    : null;

  const currentSection = contextKey ? PAGE_SECTIONS[contextKey] : null;
  const otherSections  = Object.entries(PAGE_SECTIONS).filter(([k]) => k !== contextKey);

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

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-5">

          {/* Current page — shown first, highlighted */}
          {currentSection && (
            <Section
              title={currentSection.label}
              shortcuts={currentSection.shortcuts}
              accent
            />
          )}

          {/* Global shortcuts */}
          <Section title="Global" shortcuts={GLOBAL} />

          {/* Other pages */}
          {otherSections.map(([, section]) => (
            <Section key={section.label} title={section.label} shortcuts={section.shortcuts} />
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2.5 shrink-0 flex items-center justify-between"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-secondary)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Shortcuts marked <kbd className="px-1 rounded text-xs font-mono"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>⌘</kbd> use{" "}
            <kbd className="px-1 rounded text-xs font-mono"
              style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border)" }}>Ctrl</kbd> on Windows
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

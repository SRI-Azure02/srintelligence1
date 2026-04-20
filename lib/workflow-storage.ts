/**
 * localStorage persistence for WorkflowCards saved from chat sessions.
 * Used by both the chat thread page (writer) and the workflows page (reader).
 */

import type { WorkflowCard } from "./types";

const STORAGE_KEY = "sri_saved_workflows";

export function loadSavedWorkflows(): WorkflowCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkflowCard[]) : [];
  } catch {
    return [];
  }
}

export function saveWorkflow(wf: WorkflowCard): void {
  if (typeof window === "undefined") return;
  try {
    const now = new Date().toISOString();
    const existing = loadSavedWorkflows();
    const idx = existing.findIndex((w) => w.id === wf.id);
    const stamped: WorkflowCard = {
      ...wf,
      createdAt: idx >= 0 ? (existing[idx].createdAt ?? now) : now,
      updatedAt: now,
    };
    if (idx >= 0) {
      existing[idx] = stamped;
    } else {
      existing.unshift(stamped); // newest first
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    // Notify other tabs / same-page listeners
    window.dispatchEvent(new Event("sri_workflows_updated"));
  } catch {
    /* ignore storage errors */
  }
}

export function deleteWorkflow(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const updated = loadSavedWorkflows().filter((w) => w.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new Event("sri_workflows_updated"));
  } catch {
    /* ignore */
  }
}

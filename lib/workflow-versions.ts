/**
 * Version history for saved workflows.
 * Stored under a separate localStorage key so WorkflowCard remains lightweight.
 * At most MAX_VERSIONS snapshots are kept; bookmarked versions survive the cap.
 */

import type { WorkflowVersion } from "./types";

export type { WorkflowVersion };

const VKEY         = "sri_workflow_versions";
const MAX_VERSIONS = 10;

type VersionStore = Record<string, WorkflowVersion[]>;

function loadStore(): VersionStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(VKEY);
    return raw ? (JSON.parse(raw) as VersionStore) : {};
  } catch {
    return {};
  }
}

function saveStore(store: VersionStore): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VKEY, JSON.stringify(store));
  } catch {
    /* ignore storage errors */
  }
}

export function loadVersions(workflowId: string): WorkflowVersion[] {
  return loadStore()[workflowId] ?? [];
}

/** Append a new snapshot, capping at MAX_VERSIONS (oldest non-bookmarked dropped first). */
export function appendVersion(
  workflowId: string,
  name: string,
  agentChain: WorkflowVersion["agentChain"],
  notes = ""
): WorkflowVersion {
  const store    = loadStore();
  const existing = store[workflowId] ?? [];

  const version: WorkflowVersion = {
    versionId:     `v-${Date.now()}`,
    workflowId,
    versionNumber: (existing[existing.length - 1]?.versionNumber ?? 0) + 1,
    savedAt:       new Date().toISOString(),
    name,
    agentChain,
    notes,
    bookmarked:    false,
  };

  let updated = [...existing, version];

  // Enforce cap — drop oldest non-bookmarked first; fall back to oldest if all bookmarked
  while (updated.length > MAX_VERSIONS) {
    const dropIdx = updated.findIndex((v) => !v.bookmarked);
    updated.splice(dropIdx >= 0 ? dropIdx : 0, 1);
  }

  store[workflowId] = updated;
  saveStore(store);
  return version;
}

/** Remove a specific version and return the updated list. */
export function deleteVersion(workflowId: string, versionId: string): WorkflowVersion[] {
  const store    = loadStore();
  const versions = (store[workflowId] ?? []).filter((v) => v.versionId !== versionId);
  store[workflowId] = versions;
  saveStore(store);
  return versions;
}

/** Toggle the bookmarked flag on a version and return the updated list. */
export function toggleBookmark(workflowId: string, versionId: string): WorkflowVersion[] {
  const store    = loadStore();
  const versions = (store[workflowId] ?? []).map((v) =>
    v.versionId === versionId ? { ...v, bookmarked: !v.bookmarked } : v
  );
  store[workflowId] = versions;
  saveStore(store);
  return versions;
}

/** Update the per-version note without creating a new version. */
export function updateVersionNotes(
  workflowId: string,
  versionId: string,
  notes: string
): void {
  const store    = loadStore();
  const versions = store[workflowId] ?? [];
  const idx      = versions.findIndex((v) => v.versionId === versionId);
  if (idx >= 0) {
    versions[idx]    = { ...versions[idx], notes };
    store[workflowId] = versions;
    saveStore(store);
  }
}

"use client";

import { useSyncExternalStore } from "react";
import { runStore } from "./run-store";
import type { ActiveRun, RunNotification } from "./run-store";
export type { ActiveRun, RunNotification };

/** Returns the live run state for one workflow (or undefined if idle). */
export function useActiveRun(workflowId: string | undefined): ActiveRun | undefined {
  return useSyncExternalStore(
    runStore.subscribe,
    () => (workflowId ? runStore.getActiveRun(workflowId) : undefined),
    () => undefined,
  );
}

/** Returns all notifications (completed / aborted runs). */
export function useNotifications(): RunNotification[] {
  return useSyncExternalStore(
    runStore.subscribe,
    () => runStore.getNotifications(),
    () => [],
  );
}

/** Returns the count of unread notifications. */
export function useUnreadCount(): number {
  return useSyncExternalStore(
    runStore.subscribe,
    () => runStore.unreadCount(),
    () => 0,
  );
}

/** Returns all currently active (in-progress) runs. */
export function useActiveRuns(): ActiveRun[] {
  return useSyncExternalStore(
    runStore.subscribe,
    () => runStore.getActiveRuns(),
    () => [],
  );
}

/** Returns the most recently completed/aborted run for a workflow (persists after activeRun clears). */
export function useLastRun(workflowId: string | undefined): RunNotification | undefined {
  return useSyncExternalStore(
    runStore.subscribe,
    () => (workflowId ? runStore.getLastRun(workflowId) : undefined),
    () => undefined,
  );
}

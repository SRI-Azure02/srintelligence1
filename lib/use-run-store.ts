"use client";

import { useSyncExternalStore } from "react";
import { runStore } from "./run-store";
import type { ActiveRun, RunNotification } from "./run-store";

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

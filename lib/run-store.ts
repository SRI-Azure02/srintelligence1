/**
 * Module-level singleton that owns all workflow run timers.
 * Lives outside React so runs survive page navigation in the same browser tab.
 */

export type NodeRunStatus = "idle" | "pending" | "running" | "done";
export type RunFinalStatus = "done" | "failed" | "aborted";

export interface RunNodeMeta {
  id:        string;
  agentType: string;
  label:     string;
}

export interface ActiveRun {
  runId:        string;
  workflowId:   string;
  workflowName: string;
  startedAt:    number;
  nodes:        RunNodeMeta[];
  nodeStates:   Record<string, NodeRunStatus>;
}

export interface RunNotification {
  id:           string;
  runId:        string;
  workflowId:   string;
  workflowName: string;
  status:       RunFinalStatus;
  startedAt:    number;
  completedAt:  number;
  nodes:        RunNodeMeta[];
  nodeStates:   Record<string, NodeRunStatus>;
  read:         boolean;
}

type Listener = () => void;

class RunStore {
  private _activeRuns: Map<string, ActiveRun>     = new Map();
  private _notifications: RunNotification[]        = [];
  private _listeners:  Set<Listener>               = new Set();
  private _timers:     Map<string, ReturnType<typeof setTimeout>[]> = new Map();

  // ── Subscription (for useSyncExternalStore) ────────────────────────────────
  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  private _notify() { this._listeners.forEach((l) => l()); }

  // ── Snapshots ──────────────────────────────────────────────────────────────
  getActiveRun   = (workflowId: string): ActiveRun | undefined =>
    this._activeRuns.get(workflowId);

  getActiveRuns  = (): ActiveRun[] =>
    Array.from(this._activeRuns.values());

  getNotifications = (): RunNotification[] => this._notifications;

  unreadCount = (): number =>
    this._notifications.filter((n) => !n.read).length;

  // ── Actions ────────────────────────────────────────────────────────────────
  startRun(workflowId: string, workflowName: string, nodes: RunNodeMeta[]): void {
    // Cancel any existing run for this workflow
    this._clearTimers(workflowId);
    this._activeRuns.delete(workflowId);

    const runId = `run-${Date.now()}`;
    const initialStates: Record<string, NodeRunStatus> = {};
    nodes.forEach((n) => { initialStates[n.id] = "pending"; });

    const active: ActiveRun = {
      runId,
      workflowId,
      workflowName,
      startedAt: Date.now(),
      nodes,
      nodeStates: { ...initialStates },
    };

    this._activeRuns.set(workflowId, active);
    this._notify();

    // Sequential simulation — each node runs 1.5–3.5 s
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;

    nodes.forEach((node, i) => {
      const duration = 1500 + Math.random() * 2000;
      const { id } = node;

      timers.push(setTimeout(() => {
        const run = this._activeRuns.get(workflowId);
        if (!run) return;
        run.nodeStates = { ...run.nodeStates, [id]: "running" };
        this._notify();
      }, elapsed));

      timers.push(setTimeout(() => {
        const run = this._activeRuns.get(workflowId);
        if (!run) return;
        run.nodeStates = { ...run.nodeStates, [id]: "done" };
        this._notify();

        if (i === nodes.length - 1) {
          // All nodes done → move to notifications
          const finalStates = { ...run.nodeStates };
          this._activeRuns.delete(workflowId);
          this._timers.delete(workflowId);
          this._notifications = [
            {
              id:           `notif-${Date.now()}`,
              runId,
              workflowId,
              workflowName,
              status:       "done",
              startedAt:    run.startedAt,
              completedAt:  Date.now(),
              nodes,
              nodeStates:   finalStates,
              read:         false,
            },
            ...this._notifications,
          ];
          this._notify();
        }
      }, elapsed + duration));

      elapsed += duration;
    });

    this._timers.set(workflowId, timers);
  }

  abortRun(workflowId: string): void {
    this._clearTimers(workflowId);
    const run = this._activeRuns.get(workflowId);
    if (!run) return;
    this._activeRuns.delete(workflowId);
    this._notifications = [
      {
        id:          `notif-${Date.now()}`,
        runId:       run.runId,
        workflowId,
        workflowName: run.workflowName,
        status:      "aborted",
        startedAt:   run.startedAt,
        completedAt: Date.now(),
        nodes:       run.nodes,
        nodeStates:  run.nodeStates,
        read:        false,
      },
      ...this._notifications,
    ];
    this._notify();
  }

  markRead(notifId: string): void {
    const n = this._notifications.find((x) => x.id === notifId);
    if (n && !n.read) { n.read = true; this._notify(); }
  }

  markAllRead(): void {
    const anyUnread = this._notifications.some((n) => !n.read);
    if (!anyUnread) return;
    this._notifications = this._notifications.map((n) => ({ ...n, read: true }));
    this._notify();
  }

  dismiss(notifId: string): void {
    this._notifications = this._notifications.filter((n) => n.id !== notifId);
    this._notify();
  }

  dismissAll(): void {
    if (!this._notifications.length) return;
    this._notifications = [];
    this._notify();
  }

  private _clearTimers(workflowId: string) {
    (this._timers.get(workflowId) ?? []).forEach(clearTimeout);
    this._timers.delete(workflowId);
  }
}

// Single shared instance — survives React component unmounts
export const runStore = new RunStore();

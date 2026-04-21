/**
 * Module-level singleton that owns all workflow run state.
 * Lives outside React so runs survive page navigation in the same browser tab.
 *
 * Each node is executed sequentially by calling POST /api/agent/chat —
 * the same endpoint used by the chat console. Results (AgentArtifact) are
 * stored per node so "View Report" can display real data.
 *
 * IMPORTANT: every mutation creates a NEW object and stores it back in the Map
 * so that useSyncExternalStore can detect changes via reference equality.
 */

export type NodeRunStatus = "idle" | "pending" | "running" | "done";
export type RunFinalStatus = "done" | "failed" | "aborted";

export interface RunNodeMeta {
  id:        string;
  agentType: string;
  label:     string;
  prompt?:   string;  // natural-language prompt sent to the agent
}

/**
 * Minimal artifact shape returned by /api/agent/chat SYNTHESIS_COMPLETE.
 * Compatible with AgentArtifact from @/src/types/agent — cast as needed.
 */
export interface StoredArtifact {
  id:          string;
  agentName:   string;
  intent:      string;
  data:        unknown;
  sql?:        string;
  narrative?:  string;
  createdAt:   number;
  lineageId:   string;
  cacheStatus: string;
}

export interface ActiveRun {
  runId:          string;
  workflowId:     string;
  workflowName:   string;
  startedAt:      number;
  nodes:          RunNodeMeta[];
  nodeStates:     Record<string, NodeRunStatus>;
  nodeArtifacts:  Record<string, StoredArtifact>;
}

export interface RunNotification {
  id:             string;
  runId:          string;
  workflowId:     string;
  workflowName:   string;
  status:         RunFinalStatus;
  startedAt:      number;
  completedAt:    number;
  nodes:          RunNodeMeta[];
  nodeStates:     Record<string, NodeRunStatus>;
  nodeArtifacts:  Record<string, StoredArtifact>;
  read:           boolean;
}

type Listener = () => void;

class RunStore {
  private _activeRuns:      Map<string, ActiveRun>       = new Map();
  private _notifications:   RunNotification[]            = [];
  private _listeners:       Set<Listener>                = new Set();
  private _abortControllers: Map<string, AbortController> = new Map();
  /** Last completed/aborted run per workflow — survives after activeRun clears */
  private _lastRun:         Map<string, RunNotification> = new Map();

  // ── Subscription (for useSyncExternalStore) ──────────────────────────────
  subscribe = (listener: Listener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  private _notify() { this._listeners.forEach((l) => l()); }

  // ── Snapshots ─────────────────────────────────────────────────────────────
  getActiveRun   = (workflowId: string): ActiveRun | undefined =>
    this._activeRuns.get(workflowId);

  getActiveRuns  = (): ActiveRun[] =>
    Array.from(this._activeRuns.values());

  getNotifications = (): RunNotification[] => this._notifications;

  unreadCount = (): number =>
    this._notifications.filter((n) => !n.read).length;

  /** Returns the most recently completed/aborted run for a workflow. */
  getLastRun = (workflowId: string): RunNotification | undefined =>
    this._lastRun.get(workflowId);

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Start a workflow run — fire-and-forget; real agent calls happen async. */
  startRun(workflowId: string, workflowName: string, nodes: RunNodeMeta[]): void {
    // Cancel any existing run for this workflow
    this._abortControllers.get(workflowId)?.abort();
    this._abortControllers.delete(workflowId);
    this._activeRuns.delete(workflowId);

    const controller = new AbortController();
    this._abortControllers.set(workflowId, controller);

    // Fire-and-forget — the async method manages its own state
    void this._executeRun(workflowId, workflowName, nodes, controller);
  }

  private async _executeRun(
    workflowId:   string,
    workflowName: string,
    nodes:        RunNodeMeta[],
    controller:   AbortController,
  ): Promise<void> {
    const runId    = `run-${Date.now()}`;
    const sessionId = `wf-session-${runId}`;   // shared session for cohort continuity

    // Initialise all nodes as "pending"
    const initialStates: Record<string, NodeRunStatus> = {};
    nodes.forEach((n) => { initialStates[n.id] = "pending"; });

    this._activeRuns.set(workflowId, {
      runId,
      workflowId,
      workflowName,
      startedAt:     Date.now(),
      nodes,
      nodeStates:    initialStates,
      nodeArtifacts: {},
    });
    this._notify();

    // Cohort hand-off: pass last analyst SQL + column headers to downstream nodes
    let priorAnalystSQL:     string | undefined;
    let priorAnalystColumns: string[] | undefined;

    for (let i = 0; i < nodes.length; i++) {
      if (controller.signal.aborted) break;

      const node = nodes[i];
      const run  = this._activeRuns.get(workflowId);
      if (!run) break;

      // Output node collects results — brief spinner then done (no API call)
      if (node.agentType === "output") {
        this._activeRuns.set(workflowId, {
          ...run,
          nodeStates: { ...run.nodeStates, [node.id]: "running" },
        });
        this._notify();

        await new Promise<void>((res) => {
          const t = setTimeout(res, 600);
          controller.signal.addEventListener("abort", () => { clearTimeout(t); res(); });
        });

        const cur = this._activeRuns.get(workflowId);
        if (!cur || controller.signal.aborted) break;

        this._activeRuns.set(workflowId, {
          ...cur,
          nodeStates: { ...cur.nodeStates, [node.id]: "done" },
        });
        this._notify();
        continue;
      }

      // → "running"
      this._activeRuns.set(workflowId, {
        ...run,
        nodeStates: { ...run.nodeStates, [node.id]: "running" },
      });
      this._notify();

      let artifact: StoredArtifact | undefined;

      try {
        const message = node.prompt?.trim() || `Perform ${node.label} analysis`;
        const body: Record<string, unknown> = { message, sessionId };
        if (priorAnalystSQL)     body.priorAnalystSQL     = priorAnalystSQL;
        if (priorAnalystColumns) body.priorAnalystColumns = priorAnalystColumns;

        const res = await fetch("/api/agent/chat", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          signal:  controller.signal,
          body:    JSON.stringify(body),
        });

        if (res.ok) {
          artifact = await this._readArtifactFromSSE(res);

          // Update cohort context for downstream nodes
          if (artifact) {
            const intent = String(artifact.intent).toUpperCase();
            if (intent === "ANALYST" || intent.startsWith("SQL")) {
              if (artifact.sql) priorAnalystSQL = artifact.sql;
              const d = artifact.data as { results?: { headers?: string[] } } | null;
              if (d?.results?.headers) priorAnalystColumns = d.results.headers;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") break;
        // Other errors: mark done with no artifact and continue
      }

      const cur = this._activeRuns.get(workflowId);
      if (!cur || controller.signal.aborted) break;

      // → "done"
      this._activeRuns.set(workflowId, {
        ...cur,
        nodeStates:    { ...cur.nodeStates, [node.id]: "done" },
        nodeArtifacts: artifact
          ? { ...cur.nodeArtifacts, [node.id]: artifact }
          : cur.nodeArtifacts,
      });
      this._notify();
    }

    // Clean up controller reference
    this._abortControllers.delete(workflowId);

    // If aborted, abortRun() already created the notification
    if (controller.signal.aborted) return;

    // All nodes done → move to notifications
    const finishedRun = this._activeRuns.get(workflowId);
    if (!finishedRun) return;
    this._activeRuns.delete(workflowId);

    const notif: RunNotification = {
      id:            `notif-${Date.now()}`,
      runId,
      workflowId,
      workflowName,
      status:        "done",
      startedAt:     finishedRun.startedAt,
      completedAt:   Date.now(),
      nodes,
      nodeStates:    finishedRun.nodeStates,
      nodeArtifacts: finishedRun.nodeArtifacts,
      read:          false,
    };
    this._lastRun.set(workflowId, notif);
    this._notifications = [notif, ...this._notifications];
    this._notify();
  }

  /**
   * Parse an SSE stream from /api/agent/chat and return the first artifact
   * from the SYNTHESIS_COMPLETE event payload.
   */
  private async _readArtifactFromSSE(res: Response): Promise<StoredArtifact | undefined> {
    if (!res.body) return undefined;

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as {
              type:     string;
              payload?: { artifacts?: StoredArtifact[] };
            };
            if (ev.type === "SYNTHESIS_COMPLETE" && ev.payload?.artifacts?.length) {
              reader.cancel();
              return ev.payload.artifacts[0];
            }
          } catch {
            // malformed JSON line — skip
          }
        }
      }
    } catch {
      // AbortError or network error — return undefined
    }

    return undefined;
  }

  abortRun(workflowId: string): void {
    // Signal any in-progress fetch to cancel
    this._abortControllers.get(workflowId)?.abort();
    this._abortControllers.delete(workflowId);

    const run = this._activeRuns.get(workflowId);
    if (!run) return;
    this._activeRuns.delete(workflowId);

    const notif: RunNotification = {
      id:            `notif-${Date.now()}`,
      runId:         run.runId,
      workflowId,
      workflowName:  run.workflowName,
      status:        "aborted",
      startedAt:     run.startedAt,
      completedAt:   Date.now(),
      nodes:         run.nodes,
      nodeStates:    run.nodeStates,
      nodeArtifacts: run.nodeArtifacts,
      read:          false,
    };
    this._lastRun.set(workflowId, notif);
    this._notifications = [notif, ...this._notifications];
    this._notify();
  }

  markRead(notifId: string): void {
    const n = this._notifications.find((x) => x.id === notifId);
    if (n && !n.read) {
      this._notifications = this._notifications.map((x) =>
        x.id === notifId ? { ...x, read: true } : x
      );
      this._notify();
    }
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
}

// Single shared instance — survives React component unmounts
export const runStore = new RunStore();

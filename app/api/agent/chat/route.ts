import { randomUUID } from 'crypto';
import { sessionStore } from '../../../../src/lib/session-store';
import { RouteDispatcher } from '../../../../src/lib/router/route-dispatcher';
import { ExecutionContext } from '../../../../src/lib/orchestrator/context';
import {
  discoverSemanticViews,
  getDefaultSemanticView,
  getSemanticViewById,
} from '../../../../src/lib/snowflake/semantic-discovery';
import type { ConversationMessage, DispatchEvent, SemanticViewRef } from '../../../../src/types/agent';
import type { UserPreferences } from '../../../../src/types/user';

// ---------------------------------------------------------------------------
// restoreContext — reconstruct a live ExecutionContext from stored data.
//
// After Next.js HMR re-evaluates this module, the ExecutionContext class
// reference here points to the NEW prototype, while objects retrieved from the
// session store still carry the OLD prototype (from the previous evaluation).
// Calling `instanceof ExecutionContext` detects this mismatch: if it returns
// false the stored object is a plain data bag from an old evaluation.
//
// In that case we construct a fresh ExecutionContext (new prototype, latest
// method implementations) and transfer the plain-data fields that matter for
// conversation continuity.  The Map-based intermediateResults is dropped
// intentionally — it only holds within-session ML agent results that are too
// expensive to deserialize safely and are not needed for Cortex Analyst context.
// ---------------------------------------------------------------------------
function restoreContext(
  raw: Record<string, unknown>,
  sessionId: string,
  userId: string,
  userRole: string,
): ExecutionContext {
  const stored = raw as {
    sessionId?: string;
    userId?: string;
    userRole?: string;
    semanticView?: SemanticViewRef;
    availableSemanticViews?: SemanticViewRef[];
    userPreferences?: UserPreferences;
    conversationHistory?: ConversationMessage[];
    bypassCache?: boolean;
    metadata?: Record<string, unknown>;
  };

  const ctx = new ExecutionContext({
    sessionId: stored.sessionId ?? sessionId,
    userId:    stored.userId    ?? userId,
    userRole:  stored.userRole  ?? userRole,
    semanticView:           stored.semanticView,
    availableSemanticViews: stored.availableSemanticViews ?? [],
    userPreferences:        stored.userPreferences,
    metadata:               stored.metadata,
  });

  // Conversation history is plain-data (ConversationMessage[]) — safe to copy.
  if (Array.isArray(stored.conversationHistory)) {
    ctx.conversationHistory = stored.conversationHistory;
  }
  ctx.bypassCache = stored.bypassCache ?? false;

  return ctx;
}

// Helper: extract auth headers with defaults
function extractAuth(request: Request): { userId: string; userRole: string } {
  const userId = request.headers.get('x-user-id') ?? 'anonymous';
  const userRole = request.headers.get('x-user-role') ?? 'APP_SVC_ROLE';
  return { userId, userRole };
}

// Detect "switch to <view name>" commands
function parseSwitchCommand(message: string): string | null {
  const match = message.match(/^switch\s+to\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function POST(request: Request): Promise<Response> {
  const { userId, userRole } = extractAuth(request);

  let body: {
    message: string;
    sessionId?: string;
    semanticViewId?: string;
    bypassCache?: boolean;
    priorAnalystSQL?: string;
    priorAnalystColumns?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message } = body;
  // Cache is enabled by default (repeat queries return in <50ms from memory).
  // Pass bypassCache: true in the request body to force a fresh Cortex call.
  const bypassCache = body.bypassCache ?? false;

  if (!message?.trim()) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  const sessionId = body.sessionId ?? randomUUID();

  // Load or create ExecutionContext.
  // `instanceof` check guards against the HMR stale-prototype case: when the
  // SessionStore singleton survives HMR but the stored object's prototype is
  // from the previous module evaluation, `instanceof ExecutionContext` returns
  // false. restoreContext() then constructs a fresh instance (current prototype,
  // latest method implementations) and copies the plain-data fields across so
  // conversation history is preserved even across hot-reloads.
  const stored = sessionStore.get(userId, sessionId);
  const context: ExecutionContext = !stored
    ? new ExecutionContext({ sessionId, userId, userRole })
    : stored.context instanceof ExecutionContext
      ? (stored.context as unknown as ExecutionContext)
      : restoreContext(stored.context, sessionId, userId, userRole);

  // Resolve semantic view
  // Note: ExecutionContext defaults semanticView to { fullyQualifiedName: '' }, so we must
  // also treat an empty fullyQualifiedName as "not yet resolved".
  const hasView = (v: typeof context.semanticView | null) =>
    v != null && v.fullyQualifiedName.length > 0;

  let semanticView: import('../../../../src/types/agent').SemanticViewRef | null = hasView(context.semanticView)
    ? context.semanticView
    : null;

  const switchTarget = parseSwitchCommand(message);
  if (switchTarget) {
    // "switch to X" — find view by display name or id
    console.time('0c_DISCOVER_VIEWS');
    const views = await discoverSemanticViews(userRole);
    console.timeEnd('0c_DISCOVER_VIEWS');
    const matched =
      views.find((v) => v.displayName.toLowerCase() === switchTarget.toLowerCase()) ??
      views.find((v) => v.id.toLowerCase() === switchTarget.toLowerCase());
    if (matched) {
      semanticView = matched;
      context.semanticView = matched;
    }
  } else if (body.semanticViewId && !semanticView) {
    console.time('0b_GET_VIEW_BY_ID');
    semanticView = await getSemanticViewById(body.semanticViewId);
    console.timeEnd('0b_GET_VIEW_BY_ID');
  }

  if (!semanticView) {
    console.time('0c_DEFAULT_VIEW');
    semanticView = await getDefaultSemanticView(userRole);
    console.timeEnd('0c_DEFAULT_VIEW');
  }

  if (!semanticView) {
    // Last resort: pick first available view
    console.time('0c_DISCOVER_VIEWS_FALLBACK');
    const views = await discoverSemanticViews(userRole);
    console.timeEnd('0c_DISCOVER_VIEWS_FALLBACK');
    semanticView = views[0] ?? null;
  }

  if (!semanticView) {
    return Response.json({ error: 'No semantic view available for role' }, { status: 503 });
  }

  if (semanticView) context.semanticView = semanticView;
  context.bypassCache = bypassCache;

  // ── Cohort handoff: seed intermediateResults from client if server lost them ──
  // The client persists the last ANALYST SQL + column headers in localStorage.
  // On a fresh session (e.g. after server restart) intermediateResults is empty,
  // so getLastAnalystResult() would return undefined and clustering / forecasting
  // would generate a fresh broad query instead of scoping to the prior cohort.
  // Re-seeding here ensures the dispatcher always has the cohort available.
  const priorSQL  = body.priorAnalystSQL;
  const priorCols = body.priorAnalystColumns;
  if (
    priorSQL &&
    Array.isArray(priorCols) &&
    priorCols.length > 0 &&
    !context.getResult('ANALYST_prior')
  ) {
    context.storeResult('ANALYST_prior', {
      success:     true,
      durationMs:  0,
      retryCount:  0,
      artifact: {
        id:          'prior',
        agentName:   'analyst',
        intent:      'ANALYST',
        sql:         priorSQL,
        data:        { results: { headers: priorCols, rows: [] } },
        narrative:   '',
        createdAt:   Date.now(),
        lineageId:   '',
        cacheStatus: 'miss',
      },
    });
    console.log(`[COHORT] Seeded intermediateResults from client — ${priorCols.length} columns`);
  }

  const dispatcher = new RouteDispatcher(context);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (event: DispatchEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        for await (const event of dispatcher.dispatch(message, request.signal)) {
          send(event);
        }
      } catch (err) {
        const errorEvent: DispatchEvent = {
          type: 'ERROR',
          sessionId,
          userId,
          timestamp: Date.now(),
          error: err instanceof Error ? err.message : String(err),
        };
        send(errorEvent);
      } finally {
        // Persist context back to session store
        sessionStore.set(userId, sessionId, context as unknown as Record<string, unknown>);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Session-Id': sessionId,
    },
  });
}

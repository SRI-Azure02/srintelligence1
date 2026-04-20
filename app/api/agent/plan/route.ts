/**
 * POST /api/agent/plan
 *
 * Accepts a user message and optional conversation context, calls Claude to
 * break the request into an ordered list of agent-executable steps, and
 * returns them as JSON.
 *
 * Request body:  { message: string; conversationContext?: string }
 * Response body: { plan: { steps: RawPlanStep[] } } | { error: string }
 */

import { generatePlan } from '../../../../src/lib/llm/anthropic';

export async function POST(request: Request): Promise<Response> {
  let body: { message?: string; conversationContext?: string };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, conversationContext } = body;

  if (!message?.trim()) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  try {
    const plan = await generatePlan({ message: message.trim(), conversationContext });
    return Response.json({ plan });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[plan-route] generatePlan error:', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

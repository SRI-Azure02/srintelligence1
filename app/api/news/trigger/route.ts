/**
 * POST /api/news/trigger
 *
 * Manual scrape trigger — callable from the UI by any authenticated user.
 * Internally calls the same orchestrator as the Vercel Cron job.
 * CRON_SECRET is never exposed to the browser.
 *
 * Returns a summary of what was fetched/inserted/skipped.
 */

import { loadSourcesDue, loadActiveSources } from '../../../../src/lib/news/sources-registry';
import { orchestrateScrape }                 from '../../../../src/lib/news/scrape-orchestrator';

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const userId = request.headers.get('x-user-id') ?? 'anonymous';
  if (!userId || userId === 'anonymous') {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  const startedAt = Date.now();
  const { searchParams } = new URL(request.url);
  const force = searchParams.get('force') === 'true';

  let sources;
  try {
    sources = force ? await loadActiveSources() : await loadSourcesDue();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Failed to load sources: ${message}` }, { status: 500 });
  }

  if (sources.length === 0) {
    return Response.json({
      message: 'No active sources found.',
      summary: { durationMs: Date.now() - startedAt, sources: 0, fetched: 0, inserted: 0, skipped: 0, errors: 0 },
      results: [],
    });
  }

  let results;
  try {
    results = await orchestrateScrape(sources, 'manual');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Scrape failed: ${message}` }, { status: 500 });
  }

  const summary = {
    durationMs: Date.now() - startedAt,
    sources:    results.length,
    fetched:    results.reduce((s, r) => s + r.fetched,  0),
    inserted:   results.reduce((s, r) => s + r.inserted, 0),
    skipped:    results.reduce((s, r) => s + r.skipped,  0),
    errors:     results.reduce((s, r) => s + r.errors.length, 0),
  };

  return Response.json({ summary, results });
}

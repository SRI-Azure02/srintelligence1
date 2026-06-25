/**
 * POST /api/news/scrape
 *
 * Triggered hourly by Vercel Cron (vercel.json).
 * Can also be called manually with the Authorization header.
 *
 * Processes only sources whose LAST_SCRAPED_AT is past their SCRAPE_INTERVAL_MIN
 * — so a single invocation never re-scrapes a source that was recently done.
 *
 * To avoid Vercel's 60-second function timeout, sources are processed
 * sequentially (not all-at-once). Each invocation handles however many
 * sources fit within the time budget; the cron fires again next hour
 * to pick up any that were skipped.
 */

import { loadSourcesDue }    from '../../../../src/lib/news/sources-registry';
import { orchestrateScrape } from '../../../../src/lib/news/scrape-orchestrator';

export const maxDuration = 60; // seconds — Vercel Pro limit

function isAuthorized(request: Request): boolean {
  const auth   = request.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET ?? '';

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  // Manual calls should send the same header
  return secret.length > 0 && auth === `Bearer ${secret}`;
}

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  let sources;
  try {
    sources = await loadSourcesDue();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Failed to load sources: ${message}` }, { status: 500 });
  }

  if (sources.length === 0) {
    return Response.json({ message: 'No sources due for scraping', results: [] });
  }

  let results;
  try {
    results = await orchestrateScrape(sources, 'cron');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: `Orchestrator error: ${message}` }, { status: 500 });
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

/**
 * POST /api/news/[articleId]/feedback
 *
 * Records a user's up or down vote on a news article.
 * UNIQUE (USER_ID, ARTICLE_ID) is enforced at the DB layer —
 * subsequent votes from the same user on the same article are rejected
 * with a 409 so the UI can show "already voted".
 *
 * Body:
 *   rating      'up' | 'down'           required
 *   reason      string                  required when rating = 'down'
 *   reasonText  string                  optional free text
 */

import { executeSQL } from '../../../../../src/lib/snowflake/sql-api';

const VALID_RATINGS = ['up', 'down'] as const;
const VALID_REASONS = ['not_relevant', 'outdated', 'inaccurate', 'helpful', 'other'] as const;

type Rating = typeof VALID_RATINGS[number];
type Reason = typeof VALID_REASONS[number];

function extractUserId(request: Request): string {
  return request.headers.get('x-user-id') ?? 'anonymous';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ articleId: string }> },
): Promise<Response> {
  const { articleId } = await params;
  const userId        = extractUserId(request);

  let body: { rating?: Rating; reason?: Reason; reasonText?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.rating || !(VALID_RATINGS as readonly string[]).includes(body.rating)) {
    return Response.json(
      { error: `rating must be one of: ${VALID_RATINGS.join(', ')}` },
      { status: 400 },
    );
  }

  if (body.rating === 'down' && !body.reason) {
    return Response.json(
      { error: `reason is required for a downvote. Options: ${VALID_REASONS.join(', ')}` },
      { status: 400 },
    );
  }

  if (body.reason && !(VALID_REASONS as readonly string[]).includes(body.reason)) {
    return Response.json(
      { error: `reason must be one of: ${VALID_REASONS.join(', ')}` },
      { status: 400 },
    );
  }

  const escape     = (s: string) => s.replace(/'/g, "''");
  const reason     = body.reason     ? `'${escape(body.reason)}'`     : 'NULL';
  const reasonText = body.reasonText ? `'${escape(body.reasonText)}'` : 'NULL';

  try {
    await executeSQL(`
      INSERT INTO CORTEX_TESTING.PUBLIC.NEWS_ARTICLE_FEEDBACK
          (ARTICLE_ID, USER_ID, RATING, REASON, REASON_TEXT)
      VALUES
          ('${escape(articleId)}', '${escape(userId)}', '${body.rating}', ${reason}, ${reasonText})
    `);

    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // UNIQUE constraint violation — user already voted on this article
    if (message.includes('UNIQUE') || message.includes('duplicate')) {
      return Response.json({ error: 'You have already voted on this article' }, { status: 409 });
    }

    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/news/[articleId]/feedback
 *
 * Returns the current user's vote on this article (if any),
 * plus aggregate up/down counts.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ articleId: string }> },
): Promise<Response> {
  const { articleId } = await params;
  const userId        = extractUserId(request);
  const escape        = (s: string) => s.replace(/'/g, "''");

  try {
    const [agg, mine] = await Promise.all([
      executeSQL(`
        SELECT
            SUM(CASE RATING WHEN 'up'   THEN 1 ELSE 0 END) AS UP_COUNT,
            SUM(CASE RATING WHEN 'down' THEN 1 ELSE 0 END) AS DOWN_COUNT
        FROM CORTEX_TESTING.PUBLIC.NEWS_ARTICLE_FEEDBACK
        WHERE ARTICLE_ID = '${escape(articleId)}'
      `),
      executeSQL(`
        SELECT RATING, REASON, REASON_TEXT, CREATED_AT
        FROM   CORTEX_TESTING.PUBLIC.NEWS_ARTICLE_FEEDBACK
        WHERE  ARTICLE_ID = '${escape(articleId)}'
          AND  USER_ID    = '${escape(userId)}'
        LIMIT 1
      `),
    ]);

    const counts  = agg.rows[0]  ?? { UP_COUNT: 0, DOWN_COUNT: 0 };
    const myVote  = mine.rows[0] ?? null;

    return Response.json({
      upCount:   Number(counts.UP_COUNT   ?? 0),
      downCount: Number(counts.DOWN_COUNT ?? 0),
      myVote:    myVote
        ? { rating: myVote.RATING, reason: myVote.REASON, reasonText: myVote.REASON_TEXT }
        : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/news/sources/[sourceId]
 *
 * Soft-deletes a source: sets IS_DELETED=TRUE, IS_ACTIVE=FALSE,
 * and records who deleted it, when, and why.
 * The source row is preserved for audit history.
 */

import { executeSQL } from '../../../../../src/lib/snowflake/sql-api';

const DELETE_REASONS = [
  'inactive_defunct',
  'duplicate_source',
  'not_relevant',
  'quality_issues',
  'other',
] as const;

type DeleteReason = typeof DELETE_REASONS[number];

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
): Promise<Response> {
  const { sourceId } = await params;
  const userId       = request.headers.get('x-user-id') ?? 'anonymous';

  let body: { reason: DeleteReason; reasonText?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.reason || !(DELETE_REASONS as readonly string[]).includes(body.reason)) {
    return Response.json(
      { error: `reason must be one of: ${DELETE_REASONS.join(', ')}` },
      { status: 400 },
    );
  }

  const escape     = (s: string) => s.replace(/'/g, "''");
  const reasonText = body.reasonText
    ? `'${escape(body.reasonText)}'`
    : 'NULL';

  try {
    const result = await executeSQL(`
      UPDATE CORTEX_TESTING.PUBLIC.NEWS_SOURCES
      SET
          IS_ACTIVE     = FALSE,
          IS_DELETED    = TRUE,
          DELETED_BY    = '${escape(userId)}',
          DELETED_AT    = CURRENT_TIMESTAMP(),
          DELETE_REASON = CONCAT('${escape(body.reason)}', CASE WHEN ${reasonText} IS NOT NULL THEN CONCAT(': ', ${reasonText}) ELSE '' END)
      WHERE SOURCE_ID = '${escape(sourceId)}'
        AND NVL(IS_DELETED, FALSE) = FALSE
    `);

    // Snowflake DML returns a stats row; check the actual rows-updated count
    const rowsUpdated = Number(result.rows[0]?.['number of rows updated'] ?? result.rows[0]?.['number of rows inserted'] ?? 0);
    if (rowsUpdated === 0) {
      return Response.json(
        { error: 'Source not found or already deleted' },
        { status: 404 },
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/news/sources/[sourceId]
 * Restores a previously deleted source.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
): Promise<Response> {
  const { sourceId } = await params;
  const userId       = request.headers.get('x-user-id') ?? 'anonymous';
  const escape       = (s: string) => s.replace(/'/g, "''");

  try {
    await executeSQL(`
      UPDATE CORTEX_TESTING.PUBLIC.NEWS_SOURCES
      SET
          IS_ACTIVE     = TRUE,
          IS_DELETED    = FALSE,
          DELETED_BY    = NULL,
          DELETED_AT    = NULL,
          DELETE_REASON = NULL,
          ADDED_BY      = COALESCE(ADDED_BY, '${escape(userId)}')
      WHERE SOURCE_ID = '${escape(sourceId)}'
        AND IS_DELETED = TRUE
    `);

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Temporary URL probe — dev only */
export const maxDuration = 15;
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get('rawUrl');
  if (!url) return Response.json({ error: 'rawUrl required' }, { status: 400 });
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SRIntelligence/1.0)' }, cache: 'no-store', redirect: 'follow' });
    const text = await r.text();
    return Response.json({ status: r.status, length: text.length, isRss: text.includes('<rss') || text.includes('<feed') || text.includes('<channel'), snippet: text.slice(0, 300) });
  } catch(err) {
    return Response.json({ error: String(err) });
  }
}

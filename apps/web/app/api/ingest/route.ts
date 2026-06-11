import { NextResponse } from 'next/server';

/**
 * Server-side ingest proxy. The browser never sees PULSE_API_KEY — CSV rows
 * parsed client-side are forwarded here, and this route attaches the key and
 * relays to the CRM API. Size and shape are checked before forwarding.
 */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 1000;

export async function POST(request: Request): Promise<NextResponse> {
  const apiKey = process.env.PULSE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  let payload: { type?: string; rows?: unknown[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { type, rows } = payload;
  if ((type !== 'customers' && type !== 'orders') || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'expected { type: customers|orders, rows: [] }' }, { status: 400 });
  }
  if (rows.length === 0 || rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `rows must contain 1-${MAX_ROWS} items` }, { status: 400 });
  }

  const upstream = await fetch(`${CRM_API_URL}/api/ingest/${type}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ [type]: rows }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => undefined);

  if (!upstream) {
    return NextResponse.json({ error: 'crm_api_unreachable' }, { status: 502 });
  }
  const body = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
  return NextResponse.json(body, { status: upstream.status });
}

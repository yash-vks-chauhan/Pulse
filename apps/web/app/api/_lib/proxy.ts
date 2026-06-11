import { NextResponse } from 'next/server';

/**
 * Server-side proxy to the CRM API. Every browser-facing route in app/api/*
 * goes through here so that:
 *  - PULSE_API_KEY only ever exists server-side (never in the client bundle);
 *  - upstream paths are FIXED string literals chosen by each route — the
 *    browser can never steer the proxy to an arbitrary path;
 *  - bodies are size-capped and must be valid JSON (re-serialized before
 *    forwarding, so nothing but JSON ever crosses);
 *  - upstream failures surface as generic errors without internals.
 */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';
const MAX_BODY_BYTES = 1024 * 1024;
// AI endpoints can legitimately take ~1 min (LLM call + one corrective retry).
const UPSTREAM_TIMEOUT_MS = 90_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function proxyToCrm(
  upstreamPath: string,
  options: { method: 'GET' | 'POST'; request?: Request },
): Promise<NextResponse> {
  const apiKey = process.env.PULSE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'server_not_configured' }, { status: 500 });
  }

  let body: string | undefined;
  if (options.method === 'POST' && options.request) {
    const contentLength = Number(options.request.headers.get('content-length') ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
    try {
      body = JSON.stringify(await options.request.json());
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    if (body.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
    }
  }

  const upstream = await fetch(`${CRM_API_URL}${upstreamPath}`, {
    method: options.method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
    },
    ...(body !== undefined ? { body } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  }).catch(() => undefined);

  if (!upstream) {
    return NextResponse.json({ error: 'crm_api_unreachable' }, { status: 502 });
  }
  const payload = await upstream.json().catch(() => ({ error: 'invalid_upstream_response' }));
  return NextResponse.json(payload, { status: upstream.status });
}

export function invalidId(): NextResponse {
  return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
}

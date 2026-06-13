import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';

/**
 * In-app API documentation — the brief asks for a public URL reviewers can
 * open AND use, so the ingestion API is documented here with copyable curl
 * examples instead of hiding in a Postman collection.
 */

const CRM = process.env.NEXT_PUBLIC_CRM_API_URL ?? 'http://localhost:4000';

/** Anchor id for an endpoint path, shared by the nav rail and each card. */
function slug(path: string): string {
  return path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

/** Left-rail jump list — kept in sync with the endpoints below. */
const TOC: Array<{ method: string; path: string }> = [
  { method: 'POST', path: '/api/ingest/customers' },
  { method: 'POST', path: '/api/ingest/orders' },
  { method: 'POST', path: '/api/ai/segment' },
  { method: 'POST', path: '/api/ai/draft' },
  { method: 'POST', path: '/api/segments' },
  { method: 'POST', path: '/api/segments/preview' },
  { method: 'POST', path: '/api/campaigns' },
  { method: 'POST', path: '/api/campaigns/:id/launch' },
  { method: 'GET', path: '/api/campaigns/:id/stats' },
  { method: 'GET', path: '/api/insights/:campaignId' },
  { method: 'POST', path: '/api/insights/:campaignId/follow-up' },
  { method: 'POST', path: '/api/receipts' },
  { method: 'GET', path: '/healthz' },
];

function Endpoint({
  method,
  path,
  auth,
  description,
  children,
}: {
  method: string;
  path: string;
  auth: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <Card id={slug(path)} className="scroll-mt-20">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
              method === 'GET'
                ? 'bg-accent/10 text-accent'
                : 'bg-primary text-primary-foreground'
            }`}
          >
            {method}
          </span>
          <code className="font-mono text-sm font-medium">{path}</code>
          <Badge
            variant={auth === 'public' ? 'success' : auth === 'x-api-key' ? 'warning' : 'destructive'}
            className="ml-auto font-mono text-[11px]"
          >
            {auth}
          </Badge>
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
        {children}
      </CardContent>
    </Card>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200 dark:border dark:bg-zinc-900/60">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">API documentation</h1>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        All write endpoints require the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">x-api-key</code>{' '}
        header. Webhook traffic between services is HMAC-SHA256 signed with a replay window — see{' '}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">docs/SECURITY.md</code> in the repo. Batches are
        idempotent: rows are keyed by your <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">external_id</code>,
        so retries are always safe.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-0.5">
            <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Endpoints
            </p>
            {TOC.map((entry) => (
              <a
                key={entry.path}
                href={`#${slug(entry.path)}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span
                  className={`font-mono text-[10px] font-bold ${entry.method === 'GET' ? 'text-accent' : 'text-foreground/70'}`}
                >
                  {entry.method}
                </span>
                <span className="truncate font-mono">{entry.path}</span>
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 space-y-4">
        <Endpoint
          method="POST"
          path="/api/ingest/customers"
          auth="x-api-key"
          description="Upsert up to 1,000 customers per request. Email/phone are encrypted at rest (AES-256-GCM)."
        >
          <CodeBlock>{`curl -X POST ${CRM}/api/ingest/customers \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{
    "customers": [
      {
        "external_id": "cust-1001",
        "name": "Asha Kulkarni",
        "email": "asha@example.com",
        "phone": "+91 98765 43210",
        "city": "Pune",
        "tags": ["subscriber"]
      }
    ]
  }'`}</CodeBlock>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/ingest/orders"
          auth="x-api-key"
          description="Upsert up to 1,000 orders per request. Customer rollups (total_spend, order_count, last_order_at) are recomputed from the orders table — re-ingestion never double-counts."
        >
          <CodeBlock>{`curl -X POST ${CRM}/api/ingest/orders \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{
    "orders": [
      {
        "external_id": "ord-9001",
        "customer_external_id": "cust-1001",
        "amount": 1248,
        "ordered_at": "2026-06-01T10:30:00Z",
        "items": [{ "sku": "DR-AR-250", "name": "Attikan Estate Arabica 250g", "qty": 2, "price": 449 }]
      }
    ]
  }'`}</CodeBlock>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/ai/segment"
          auth="x-api-key"
          description="Natural language → Segment DSL via LLM structured output. The model can only emit the whitelisted DSL; the result is zod-validated (one corrective retry) before it reaches you. Rate-limited to 10/min."
        >
          <CodeBlock>{`curl -X POST ${CRM}/api/ai/segment \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{ "prompt": "shoppers who bought 2+ times but nothing in 60 days, spend above ₹2,000" }'

# → { "dsl": { "logic": "AND", "conditions": [...] }, "explanation": "..." }`}</CodeBlock>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/ai/draft"
          auth="x-api-key"
          description="Draft 1-3 channel-appropriate message variants for a campaign objective. Variants may only use the {{name}} and {{city}} merge tags and are length-capped per channel. Rate-limited to 10/min."
        >
          <CodeBlock>{`curl -X POST ${CRM}/api/ai/draft \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{ "objective": "Win back lapsed buyers with 15% off, code BREW15", "channel": "whatsapp" }'`}</CodeBlock>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/segments"
          auth="x-api-key"
          description="Save a segment (validated DSL). Also: GET /api/segments to list, GET /api/segments/:id to fetch one."
        >
          <CodeBlock>{`curl -X POST ${CRM}/api/segments \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{
    "name": "Lapsed big spenders",
    "dsl": {
      "logic": "AND",
      "conditions": [
        { "field": "order_count", "op": "gte", "value": 2 },
        { "field": "last_order_at", "op": "older_than_days", "value": 60 },
        { "field": "total_spend", "op": "gt", "value": 2000 }
      ]
    }
  }'`}</CodeBlock>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/segments/preview"
          auth="x-api-key"
          description="Stateless audience preview for a DSL document: matching count plus a small non-PII sample (encrypted email/phone are never decrypted for previews)."
        />

        <Endpoint
          method="POST"
          path="/api/campaigns"
          auth="x-api-key"
          description="Create a draft campaign with a message template ({{name}}, {{city}} merge tags), a channel policy with ordered failover, and either a saved segment_id or raw audience filters."
        >
          <CodeBlock>{`curl -X POST ${CRM}/api/campaigns \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{
    "name": "Win-back June",
    "message_template": "Hi {{name}}, we miss you! 20% off your next brew ☕",
    "channel_policy": { "primary": "whatsapp", "failover": ["sms"], "failoverWindowMinutes": 5 },
    "segment_id": "<uuid from POST /api/segments>"
  }'`}</CodeBlock>
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/campaigns/:id/launch"
          auth="x-api-key"
          description="Snapshot the audience, create QUEUED communications, and start batched dispatch through the queue with per-channel throttle handling."
        />

        <Endpoint
          method="GET"
          path="/api/campaigns/:id/stats"
          auth="x-api-key"
          description="Live funnel derived from the append-only event log: queued → sent → delivered → engaged → clicked, plus failure counts, raw event totals, and failover savings (escalations / rescued)."
        />

        <Endpoint
          method="GET"
          path="/api/insights/:campaignId"
          auth="x-api-key"
          description="Per-channel breakdown, attributed revenue (72h last-touch), failover savings, and a performance narrative with a recommended next action (AI-written when configured, honest heuristic otherwise). Rate-limited to 20/min."
        />

        <Endpoint
          method="POST"
          path="/api/insights/:campaignId/follow-up"
          auth="x-api-key"
          description="One-click follow-up: creates a DRAFT campaign targeting customers who were reached but never engaged. Channel/objective/message default from the recommendation; the marketer reviews and launches."
        />

        <Endpoint
          method="POST"
          path="/api/receipts"
          auth="HMAC signature"
          description="Vendor-facing webhook (used by the channel simulator). Idempotent via per-event idempotency keys; out-of-order events never downgrade a communication's status. Not callable without the shared HMAC secret."
        />

        <Endpoint
          method="GET"
          path="/healthz"
          auth="public"
          description="Liveness + dependency health for the CRM API (database, queue)."
        />
        </div>
      </div>
    </div>
  );
}

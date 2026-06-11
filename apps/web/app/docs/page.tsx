/**
 * In-app API documentation — the brief asks for a public URL reviewers can
 * open AND use, so the ingestion API is documented here with copyable curl
 * examples instead of hiding in a Postman collection.
 */

const CRM = process.env.NEXT_PUBLIC_CRM_API_URL ?? 'http://localhost:4000';

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
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-pulse-600 px-2 py-0.5 text-xs font-bold text-white">
          {method}
        </span>
        <code className="text-sm font-medium">{path}</code>
        <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          {auth}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
      {children}
    </pre>
  );
}

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">API documentation</h1>
      <p className="mt-2 text-sm text-slate-600">
        All write endpoints require the <code className="rounded bg-slate-100 px-1">x-api-key</code>{' '}
        header. Webhook traffic between services is HMAC-SHA256 signed with a replay window — see{' '}
        <code className="rounded bg-slate-100 px-1">docs/SECURITY.md</code> in the repo. Batches are
        idempotent: rows are keyed by your <code className="rounded bg-slate-100 px-1">external_id</code>,
        so retries are always safe.
      </p>

      <div className="mt-6 space-y-4">
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
          path="/api/campaigns"
          auth="x-api-key"
          description="Create a draft campaign with a message template ({{name}}, {{city}} merge tags), a channel policy, and raw audience filters (the Segment DSL arrives in Phase 2)."
        >
          <CodeBlock>{`curl -X POST ${CRM}/api/campaigns \\
  -H 'content-type: application/json' \\
  -H 'x-api-key: $PULSE_API_KEY' \\
  -d '{
    "name": "Win-back June",
    "message_template": "Hi {{name}}, we miss you! 20% off your next brew ☕",
    "channel_policy": { "primary": "whatsapp", "failover": ["sms"] },
    "audience": { "min_order_count": 2, "limit": 1000 }
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
          description="Live funnel derived from the append-only event log: queued → sent → delivered → engaged → clicked, plus failure counts and raw event totals."
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
  );
}

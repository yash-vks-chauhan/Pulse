const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';
const SIMULATOR_URL = process.env.SIMULATOR_URL ?? 'http://localhost:4100';

export const dynamic = 'force-dynamic';

async function checkHealth(url: string): Promise<'up' | 'down'> {
  try {
    const response = await fetch(`${url}/healthz`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    return response.ok ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

function StatusPill({ status }: { status: 'up' | 'down' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === 'up' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`}
      />
      {status === 'up' ? 'Operational' : 'Unreachable'}
    </span>
  );
}

export default async function OverviewPage() {
  const [crm, simulator] = await Promise.all([
    checkHealth(CRM_API_URL),
    checkHealth(SIMULATOR_URL),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Campaign Copilot</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Tell Pulse who you want to win back — it proposes the audience, message, and channel
        plan. You approve, it executes through a realistic delivery pipeline and learns from the
        results. Phase 1 ships the spine: ingest, delivery simulation, and the receipt loop.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">CRM API</h2>
            <StatusPill status={crm} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Ingest, campaigns, receipts, insights. NestJS + Prisma + BullMQ.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Channel Simulator</h2>
            <StatusPill status={simulator} />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            WhatsApp / SMS / Email / RCS vendor stand-in with chaos dials.
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-medium">Get started</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
          <li>
            Upload customers and orders as CSV on the <a href="/data" className="font-medium text-pulse-600 hover:underline">Data page</a>, or
            POST them to the ingestion API (see <a href="/docs" className="font-medium text-pulse-600 hover:underline">API Docs</a>).
          </li>
          <li>Launch a campaign via the API — the copilot UI lands in Phase 2.</li>
          <li>Watch delivery states converge on the campaign stats endpoint.</li>
        </ol>
      </div>
    </div>
  );
}

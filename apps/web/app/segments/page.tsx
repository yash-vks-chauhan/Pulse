import Link from 'next/link';

/** Saved segments — server component, key stays server-side. */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

interface Condition {
  field: string;
  op: string;
  value: number | string;
}
interface Segment {
  id: string;
  name: string;
  dslJson: { logic: 'AND' | 'OR'; conditions: Condition[] };
  createdFrom: string;
  nlPrompt: string | null;
  createdAt: string;
  _count: { campaigns: number };
}

const OP_LABELS: Record<string, string> = {
  eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤',
  older_than_days: 'older than', within_days: 'within',
  contains: 'contains', includes: 'includes',
};

function conditionText(condition: Condition): string {
  const suffix = condition.op.endsWith('_days') ? ' days' : '';
  return `${condition.field.replaceAll('_', ' ')} ${OP_LABELS[condition.op] ?? condition.op} ${condition.value}${suffix}`;
}

async function fetchSegments(): Promise<Segment[] | null> {
  try {
    const response = await fetch(`${CRM_API_URL}/api/segments`, {
      headers: { 'x-api-key': process.env.PULSE_API_KEY ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Segment[];
  } catch {
    return null;
  }
}

export default async function SegmentsPage() {
  const segments = await fetchSegments();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
        <Link
          href="/copilot"
          className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700"
        >
          New segment
        </Link>
      </div>

      {segments === null && (
        <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Could not reach the CRM API.
        </p>
      )}

      {segments !== null && segments.length === 0 && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No segments yet — describe one in the{' '}
          <Link href="/copilot" className="font-medium text-pulse-600 hover:underline">Copilot</Link>.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {segments?.map((segment) => (
          <div key={segment.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium">{segment.name}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  segment.createdFrom === 'nl' ? 'bg-violet-100 text-violet-800' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {segment.createdFrom === 'nl' ? 'AI-proposed' : 'manual'}
              </span>
              <span className="ml-auto text-xs text-slate-400">
                {segment._count.campaigns} campaign{segment._count.campaigns === 1 ? '' : 's'} ·{' '}
                {new Date(segment.createdAt).toLocaleDateString()}
              </span>
            </div>
            {segment.nlPrompt && (
              <p className="mt-1 text-xs italic text-slate-500">“{segment.nlPrompt}”</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {segment.dslJson.conditions.map((condition, index) => (
                <span key={index} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                  {conditionText(condition)}
                </span>
              ))}
              <span className="rounded-md bg-pulse-50 px-2 py-1 text-xs font-medium text-pulse-700">
                match {segment.dslJson.logic === 'AND' ? 'ALL' : 'ANY'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

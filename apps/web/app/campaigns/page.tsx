import Link from 'next/link';

/**
 * Campaign list — server component. Fetches the CRM API directly with the
 * server-held key; nothing sensitive reaches the browser.
 */

const CRM_API_URL = process.env.CRM_API_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

interface Campaign {
  id: string;
  name: string;
  status: 'DRAFT' | 'RUNNING' | 'COMPLETED';
  audienceSnapshotCount: number;
  launchedAt: string | null;
  createdAt: string;
}

async function fetchCampaigns(): Promise<Campaign[] | null> {
  try {
    const response = await fetch(`${CRM_API_URL}/api/campaigns`, {
      headers: { 'x-api-key': process.env.PULSE_API_KEY ?? '' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as Campaign[];
  } catch {
    return null;
  }
}

const STATUS_STYLES: Record<Campaign['status'], string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  RUNNING: 'bg-sky-100 text-sky-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
};

export default async function CampaignsPage() {
  const campaigns = await fetchCampaigns();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <Link
          href="/copilot"
          className="rounded-lg bg-pulse-600 px-4 py-2 text-sm font-medium text-white hover:bg-pulse-700"
        >
          New campaign
        </Link>
      </div>

      {campaigns === null && (
        <p className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Could not reach the CRM API.
        </p>
      )}

      {campaigns !== null && campaigns.length === 0 && (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          No campaigns yet — start one in the <Link href="/copilot" className="font-medium text-pulse-600 hover:underline">Copilot</Link>.
        </p>
      )}

      {campaigns !== null && campaigns.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Audience</th>
                <th className="px-4 py-3 font-medium">Launched</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/campaigns/${campaign.id}`} className="font-medium text-pulse-700 hover:underline">
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[campaign.status]}`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.audienceSnapshotCount > 0 ? campaign.audienceSnapshotCount.toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {campaign.launchedAt ? new Date(campaign.launchedAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { ChevronRight, Plus, Send } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import { cn } from '../../lib/utils';

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

const STATUS_VARIANT: Record<Campaign['status'], 'secondary' | 'accent' | 'success'> = {
  DRAFT: 'secondary',
  RUNNING: 'accent',
  COMPLETED: 'success',
};

/** One cell of the divided stat strip — borders come from the parent grid. */
function StatTile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('px-5 py-4', className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

export default async function CampaignsPage() {
  const campaigns = await fetchCampaigns();

  const total = campaigns?.length ?? 0;
  const reached =
    campaigns?.reduce((sum, campaign) => sum + campaign.audienceSnapshotCount, 0) ?? 0;
  const running = campaigns?.filter((campaign) => campaign.status === 'RUNNING').length ?? 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every send, live and historical — stats derive from the event log.
          </p>
        </div>
        <Button asChild>
          <Link href="/copilot">
            <Plus />
            New campaign
          </Link>
        </Button>
      </div>

      {campaigns === null && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>Could not reach the CRM API.</AlertDescription>
        </Alert>
      )}

      {campaigns !== null && (
        <>
          <Card className="mt-6 overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-3">
              <StatTile label="Campaigns" value={total.toLocaleString()} />
              <StatTile
                label="Customers reached"
                value={reached.toLocaleString()}
                className="border-t sm:border-l sm:border-t-0"
              />
              <StatTile
                label="Running now"
                value={running.toLocaleString()}
                className="border-t sm:border-l sm:border-t-0"
              />
            </div>
          </Card>

          {campaigns.length === 0 ? (
            <Card className="mt-4">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
                  <Send className="h-5 w-5 text-muted-foreground" />
                </span>
                <p className="mt-4 font-medium">No campaigns yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Describe an audience in the Copilot and launch your first
                  campaign in under a minute.
                </p>
                <Button asChild className="mt-5">
                  <Link href="/copilot">Start in the Copilot</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="mt-4 overflow-hidden py-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Audience</TableHead>
                    <TableHead className="text-right">Launched</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id} className="group">
                      <TableCell>
                        <Link
                          href={`/campaigns/${campaign.id}`}
                          className="font-medium hover:text-accent"
                        >
                          {campaign.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[campaign.status]}>
                          {campaign.status === 'RUNNING' && (
                            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                          )}
                          {campaign.status.toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {campaign.audienceSnapshotCount > 0
                          ? campaign.audienceSnapshotCount.toLocaleString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {campaign.launchedAt
                          ? new Date(campaign.launchedAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

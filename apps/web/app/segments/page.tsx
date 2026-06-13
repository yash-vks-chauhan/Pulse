import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

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
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Segments</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saved audiences — every campaign snapshots one at launch.
          </p>
        </div>
        <Button asChild>
          <Link href="/copilot">
            <Plus />
            New segment
          </Link>
        </Button>
      </div>

      {segments === null && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>Could not reach the CRM API.</AlertDescription>
        </Alert>
      )}

      {segments !== null && segments.length === 0 && (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </span>
            <p className="mt-4 font-medium">No segments yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Describe one in plain language in the Copilot — it becomes
              editable rules with a live count.
            </p>
            <Button asChild className="mt-5">
              <Link href="/copilot">Describe an audience</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {segments?.map((segment) => (
          <Card key={segment.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-medium">{segment.name}</h2>
                <Badge variant={segment.createdFrom === 'nl' ? 'ai' : 'secondary'}>
                  {segment.createdFrom === 'nl' ? 'AI-proposed' : 'manual'}
                </Badge>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {segment._count.campaigns} campaign{segment._count.campaigns === 1 ? '' : 's'} ·{' '}
                  {new Date(segment.createdAt).toLocaleDateString(undefined, {
                    dateStyle: 'medium',
                  })}
                </span>
              </div>
              {segment.nlPrompt && (
                <p className="mt-1.5 text-xs italic text-muted-foreground">“{segment.nlPrompt}”</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {segment.dslJson.conditions.map((condition, index) => (
                  <span key={index} className="rounded-md bg-muted px-2 py-1 text-xs">
                    {conditionText(condition)}
                  </span>
                ))}
                <span className="rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                  match {segment.dslJson.logic === 'AND' ? 'ALL' : 'ANY'}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

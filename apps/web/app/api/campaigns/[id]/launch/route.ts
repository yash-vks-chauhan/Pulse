import { invalidId, isUuid, proxyToCrm } from '../../../_lib/proxy';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return invalidId();
  return proxyToCrm(`/api/campaigns/${id}/launch`, { method: 'POST' });
}

import { invalidId, isUuid, proxyToCrm } from '../../../_lib/proxy';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return invalidId();
  return proxyToCrm(`/api/insights/${id}/follow-up`, { method: 'POST', request });
}

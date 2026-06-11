import { proxyToCrm } from '../../_lib/proxy';

export async function POST(request: Request) {
  return proxyToCrm('/api/ai/segment', { method: 'POST', request });
}

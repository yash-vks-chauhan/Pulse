import { proxyToCrm } from '../_lib/proxy';

export async function GET() {
  return proxyToCrm('/api/campaigns', { method: 'GET' });
}

export async function POST(request: Request) {
  return proxyToCrm('/api/campaigns', { method: 'POST', request });
}

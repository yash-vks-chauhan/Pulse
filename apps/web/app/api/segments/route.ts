import { proxyToCrm } from '../_lib/proxy';

export async function GET() {
  return proxyToCrm('/api/segments', { method: 'GET' });
}

export async function POST(request: Request) {
  return proxyToCrm('/api/segments', { method: 'POST', request });
}

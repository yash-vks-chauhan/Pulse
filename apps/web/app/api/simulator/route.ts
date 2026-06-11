import { proxyToSimulatorAdmin } from '../_lib/proxy';

export async function GET() {
  return proxyToSimulatorAdmin({ method: 'GET' });
}

export async function PUT(request: Request) {
  return proxyToSimulatorAdmin({ method: 'PUT', request });
}

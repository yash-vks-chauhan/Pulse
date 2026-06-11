import { Controller, Get } from '@nestjs/common';
import { config } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchQueueService } from '../worker/dispatch-queue.service';

const HEALTH_TIMEOUT_MS = 2500;

@Controller('healthz')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: DispatchQueueService,
  ) {}

  /** Public liveness/readiness: reports dependency health, leaks no internals. */
  @Get()
  async check() {
    const [db, redis, simulator] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.queueService.connection.ping().then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.checkSimulator(),
    ]);
    return {
      status: db === 'up' && redis === 'up' && simulator === 'up' ? 'ok' : 'degraded',
      service: 'crm-api',
      dependencies: { database: db, redis, simulator },
    };
  }

  private async checkSimulator(): Promise<'up' | 'down'> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    try {
      const response = await fetch(`${config.simulatorUrl}/healthz`, {
        signal: controller.signal,
      });
      return response.ok ? 'up' : 'down';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timeout);
    }
  }
}

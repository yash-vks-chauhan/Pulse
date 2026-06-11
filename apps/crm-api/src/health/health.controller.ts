import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DispatchQueueService } from '../worker/dispatch-queue.service';

@Controller('healthz')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: DispatchQueueService,
  ) {}

  /** Public liveness/readiness: reports dependency health, leaks no internals. */
  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      this.queueService.connection.ping().then(
        () => 'up' as const,
        () => 'down' as const,
      ),
    ]);
    return {
      status: db === 'up' && redis === 'up' ? 'ok' : 'degraded',
      service: 'crm-api',
      dependencies: { database: db, redis },
    };
  }
}

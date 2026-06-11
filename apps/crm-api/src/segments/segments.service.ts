import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { compileSegmentDsl } from './dsl.compiler';
import type { CreateSegment, PreviewSegment } from './segments.schemas';

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateSegment) {
    return this.prisma.segment.create({
      data: {
        name: input.name,
        dslJson: input.dsl,
        createdFrom: input.created_from,
        nlPrompt: input.nl_prompt,
      },
    });
  }

  list() {
    return this.prisma.segment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { campaigns: true } } },
    });
  }

  async get(id: string) {
    const segment = await this.prisma.segment.findUnique({ where: { id } });
    if (!segment) throw new NotFoundException({ error: 'segment_not_found' });
    return segment;
  }

  /**
   * Live audience preview: count + a small sample. The sample exposes only
   * non-sensitive columns — email/phone stay encrypted at rest and are never
   * decrypted for previews, only just-in-time at dispatch.
   */
  async preview(input: PreviewSegment) {
    const where = compileSegmentDsl(input.dsl);
    const [count, sample] = await Promise.all([
      this.prisma.customer.count({ where }),
      input.sample_size > 0
        ? this.prisma.customer.findMany({
            where,
            select: {
              id: true,
              name: true,
              city: true,
              totalSpend: true,
              orderCount: true,
              lastOrderAt: true,
              tags: true,
            },
            orderBy: { totalSpend: 'desc' },
            take: input.sample_size,
          })
        : Promise.resolve([]),
    ]);
    return { count, sample };
  }
}

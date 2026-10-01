import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { RESERVATION_SOURCES, type ReservationSource } from '../../domain/reservation';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { presentSyncRun } from './sync-run.presenter';

class ListSyncsQuery {
  @IsOptional()
  @IsIn(RESERVATION_SOURCES)
  source?: ReservationSource;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller('syncs')
export class SyncsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: ListSyncsQuery) {
    const runs = await this.prisma.syncRun.findMany({
      where: query.source ? { source: query.source } : {},
      orderBy: { startedAt: 'desc' },
      take: query.limit ?? 20,
    });
    return runs.map(presentSyncRun);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    const run = await this.prisma.syncRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException('Synchronization not found');
    return presentSyncRun(run);
  }
}

import type { SyncRun } from '@prisma/client';

export function presentSyncRun(run: SyncRun) {
  return {
    id: run.id,
    source: run.source,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    counts: {
      fetched: run.fetchedCount,
      created: run.createdCount,
      updated: run.updatedCount,
      unchanged: run.unchangedCount,
      cancelled: run.cancelledCount,
      pendingAssignment: run.pendingCount,
      errors: run.errorCount,
    },
    errorMessage: run.errorMessage,
    errors: (run.errorDetails as { externalId?: string; scope?: string; message: string }[] | null) ?? [],
  };
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { IMPORTS_QUEUE, ImportJob, ImportJobData } from './imports.queue';
import { ImportsService } from './imports.service';

/**
 * Background worker for the imports queue.
 * - Validation problems (bad file, archived account, ...) are permanent:
 *   no retry, the user sees the message on the import.
 * - Anything else (database or Redis hiccup) is retried with backoff; after
 *   the last attempt the import is marked failed.
 */
@Processor(IMPORTS_QUEUE)
export class ImportsProcessor extends WorkerHost {
  private readonly logger = new Logger(ImportsProcessor.name);

  constructor(private readonly importsService: ImportsService) {
    super();
  }

  async process(job: Job<ImportJobData>): Promise<void> {
    const { importId } = job.data;
    try {
      if (job.name === ImportJob.PREVIEW) {
        await this.importsService.buildPreview(importId);
      } else if (job.name === ImportJob.CONFIRM) {
        await this.importsService.applyConfirm(importId);
      } else {
        throw new UnrecoverableError(`Unknown job "${job.name}"`);
      }
    } catch (err) {
      const permanent =
        err instanceof HttpException || err instanceof UnrecoverableError;
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const message = permanent
        ? (err as Error).message
        : 'Unexpected error while processing the import. Please try again.';

      // Ids only: statement contents are personal data.
      this.logger.warn(
        `Job ${job.name} for import ${importId} failed (attempt ${job.attemptsMade + 1}): ${(err as Error).message}`,
      );

      if (permanent || lastAttempt) {
        await this.importsService.markJobFailed(
          job.name as ImportJob,
          importId,
          message,
        );
      }
      throw permanent ? new UnrecoverableError(message) : err;
    }
  }
}

export const IMPORTS_QUEUE = 'imports';

export enum ImportJob {
  /** Parse the uploaded file and build the preview rows. */
  PREVIEW = 'preview',
  /** Create transactions from the selected preview rows. */
  CONFIRM = 'confirm',
}

export interface ImportJobData {
  importId: string;
}

export const IMPORT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 1000,
};

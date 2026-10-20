import { log as appLog } from '@/core/log';

export const log = {
  updates: (event: string, meta?: unknown) => appLog.nav(`OTA: ${event}`, meta),
  error: appLog.error,
};

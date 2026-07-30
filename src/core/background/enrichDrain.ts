import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { bus } from '@/core/command/bus';
import { log } from '@/core/log';
import { maybeNudgeLapsed } from '@/core/notifications/reminders';

const TASK = 'gym.enrich-drain';
/** The OS floor (15 min). iOS treats it as a hint and picks its own moment. */
const INTERVAL_MINUTES = 15;

const isNative = Platform.OS !== 'web';

function errText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Module scope, before any component mounts: the OS can spin up the JS bundle
// with no UI to run this task, so the definition cannot live inside a component
// or it would not exist on a cold background launch.
if (isNative) {
  TaskManager.defineTask(TASK, async () => {
    try {
      // Reuse the exact same drain the app runs on boot. resumePending awaits
      // every enrich, so the task holds the process open until the queue settles
      // instead of returning straight into a suspend.
      const drained = await bus.resumePending();
      await maybeNudgeLapsed();
      log.note('enrich drain ran', { drained });
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      log.error('enrich drain failed', { error: errText(error) });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/**
 * Register the periodic drain once. Safe on every launch — no-ops if already
 * registered, if the OS restricted background work, or on web.
 */
export async function registerEnrichDrain(): Promise<void> {
  if (!isNative) return;
  try {
    if (
      (await BackgroundTask.getStatusAsync()) ===
      BackgroundTask.BackgroundTaskStatus.Restricted
    ) {
      log.note('enrich drain skipped (restricted)');
      return;
    }
    if (await TaskManager.isTaskRegisteredAsync(TASK)) return;
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: INTERVAL_MINUTES });
    log.note('enrich drain registered');
  } catch (error) {
    log.error('enrich drain register failed', { error: errText(error) });
  }
}

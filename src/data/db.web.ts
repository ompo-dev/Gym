import { clearWebData } from "./webStorage";

export function getDb(): Promise<never> {
  return Promise.reject(new Error("SQLite is not used on web."));
}

export async function wipeAllData(): Promise<void> {
  clearWebData();
}

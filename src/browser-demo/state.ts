export const demoStorageKey = "qinghe-interactive-demo-v1";
export let storageAvailable = true;
export function reportStorage(available: boolean) {
  storageAvailable = available;
  window.dispatchEvent(new Event("qinghe-demo-storage"));
}
export function clearDemo() {
  try {
    for (const key of [demoStorageKey, "qinghe-demo-role", "qinghe-shopping-draft", "qinghe-shopping-session-v1"])
      sessionStorage.removeItem(key);
  } catch { /* A new page still starts fresh when storage is blocked. */ }
}

import { test as base } from '@playwright/test';

// Existing Chinese interaction scenarios explicitly choose Chinese. Fresh-visitor
// defaults are covered independently in default-language.spec.ts.
export const test = base.extend({
  storageState: async ({ baseURL }, use) => {
    await use({ cookies: [], origins: [{
      origin: new URL(baseURL!).origin,
      localStorage: [{ name: 'qinghe-language', value: 'zh' }],
    }] });
  },
});

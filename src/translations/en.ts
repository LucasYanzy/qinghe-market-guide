import { workflowEnglish } from "./workflows.ts";
import { screenEnglish } from "./screen.ts";
import { operationsEnglish } from "./operations.ts";
import { previewEnglish } from "./preview.ts";
import { commonEnglish } from "./common.ts";
import { schoolEnglish } from "./school.ts";
import { marketEnglish } from "./market.ts";
import { simpleEnglish } from "./simple.ts";

import { releaseEnglish } from "./release.ts";

export const english: Record<string, string> = {
  ...releaseEnglish,
  ...workflowEnglish,
  ...commonEnglish,
  ...screenEnglish,
  ...operationsEnglish,
  ...previewEnglish,
  ...schoolEnglish,
  ...marketEnglish,
  ...simpleEnglish,
};

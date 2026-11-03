import { common } from './vi-common';
import { settings } from './vi-settings';
import { workspace } from './vi-workspace';
import { library } from './vi-library';
import { process } from './vi-process';
import { documents } from './vi-documents';
import { assistant } from './vi-assistant';
import { previews } from './vi-previews';
import { details } from './vi-details';
import { roles } from './vi-roles';
import { metrics } from './vi-metrics';
import { examples } from './vi-examples';
import { errors } from './vi-errors';
import { orchestrator } from './vi-orchestrator';
import { credit } from './vi-credit';
/** Authored Vietnamese UI copy. English keys remain the original source of truth. */
export const vi: Readonly<Record<string, string>> = { ...common, ...settings, ...workspace, ...library, ...process, ...documents, ...assistant, ...previews, ...details, ...roles, ...metrics, ...examples, ...errors, ...orchestrator, ...credit };

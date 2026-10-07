/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as contacts from "../contacts.js";
import type * as conversations from "../conversations.js";
import type * as knowledge from "../knowledge.js";
import type * as lib_cascade from "../lib/cascade.js";
import type * as lib_handles from "../lib/handles.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_seedData from "../lib/seedData.js";
import type * as lib_seedUsage from "../lib/seedUsage.js";
import type * as lib_stats from "../lib/stats.js";
import type * as lib_usage from "../lib/usage.js";
import type * as numbers from "../numbers.js";
import type * as seed from "../seed.js";
import type * as usage from "../usage.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  contacts: typeof contacts;
  conversations: typeof conversations;
  knowledge: typeof knowledge;
  "lib/cascade": typeof lib_cascade;
  "lib/handles": typeof lib_handles;
  "lib/models": typeof lib_models;
  "lib/seedData": typeof lib_seedData;
  "lib/seedUsage": typeof lib_seedUsage;
  "lib/stats": typeof lib_stats;
  "lib/usage": typeof lib_usage;
  numbers: typeof numbers;
  seed: typeof seed;
  usage: typeof usage;
  workspace: typeof workspace;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

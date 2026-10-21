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
import type * as allowed from "../allowed.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as knowledge from "../knowledge.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_computers from "../lib/computers.js";
import type * as lib_handles from "../lib/handles.js";
import type * as lib_keyModels from "../lib/keyModels.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_numbers from "../lib/numbers.js";
import type * as lib_orgo from "../lib/orgo.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_prompt from "../lib/prompt.js";
import type * as lib_quiet from "../lib/quiet.js";
import type * as lib_sealed from "../lib/sealed.js";
import type * as lib_tasks from "../lib/tasks.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_usage from "../lib/usage.js";
import type * as migrations from "../migrations.js";
import type * as numbers from "../numbers.js";
import type * as orgo from "../orgo.js";
import type * as platform from "../platform.js";
import type * as runner from "../runner.js";
import type * as runners from "../runners.js";
import type * as secrets from "../secrets.js";
import type * as tasks from "../tasks.js";
import type * as usage from "../usage.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  allowed: typeof allowed;
  auth: typeof auth;
  http: typeof http;
  knowledge: typeof knowledge;
  "lib/access": typeof lib_access;
  "lib/computers": typeof lib_computers;
  "lib/handles": typeof lib_handles;
  "lib/keyModels": typeof lib_keyModels;
  "lib/models": typeof lib_models;
  "lib/numbers": typeof lib_numbers;
  "lib/orgo": typeof lib_orgo;
  "lib/owner": typeof lib_owner;
  "lib/prompt": typeof lib_prompt;
  "lib/quiet": typeof lib_quiet;
  "lib/sealed": typeof lib_sealed;
  "lib/tasks": typeof lib_tasks;
  "lib/tokens": typeof lib_tokens;
  "lib/usage": typeof lib_usage;
  migrations: typeof migrations;
  numbers: typeof numbers;
  orgo: typeof orgo;
  platform: typeof platform;
  runner: typeof runner;
  runners: typeof runners;
  secrets: typeof secrets;
  tasks: typeof tasks;
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

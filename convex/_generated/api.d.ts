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
import type * as auth from "../auth.js";
import type * as connections from "../connections.js";
import type * as contacts from "../contacts.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as delivery from "../delivery.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as knowledge from "../knowledge.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_cascade from "../lib/cascade.js";
import type * as lib_connectionInfo from "../lib/connectionInfo.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_handles from "../lib/handles.js";
import type * as lib_inbox from "../lib/inbox.js";
import type * as lib_llm from "../lib/llm.js";
import type * as lib_models from "../lib/models.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_prompt from "../lib/prompt.js";
import type * as lib_providers from "../lib/providers.js";
import type * as lib_quiet from "../lib/quiet.js";
import type * as lib_stats from "../lib/stats.js";
import type * as lib_usage from "../lib/usage.js";
import type * as notifications from "../notifications.js";
import type * as numbers from "../numbers.js";
import type * as replies from "../replies.js";
import type * as usage from "../usage.js";
import type * as workspace from "../workspace.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  auth: typeof auth;
  connections: typeof connections;
  contacts: typeof contacts;
  conversations: typeof conversations;
  crons: typeof crons;
  delivery: typeof delivery;
  http: typeof http;
  inbound: typeof inbound;
  knowledge: typeof knowledge;
  "lib/access": typeof lib_access;
  "lib/cascade": typeof lib_cascade;
  "lib/connectionInfo": typeof lib_connectionInfo;
  "lib/crypto": typeof lib_crypto;
  "lib/handles": typeof lib_handles;
  "lib/inbox": typeof lib_inbox;
  "lib/llm": typeof lib_llm;
  "lib/models": typeof lib_models;
  "lib/notify": typeof lib_notify;
  "lib/prompt": typeof lib_prompt;
  "lib/providers": typeof lib_providers;
  "lib/quiet": typeof lib_quiet;
  "lib/stats": typeof lib_stats;
  "lib/usage": typeof lib_usage;
  notifications: typeof notifications;
  numbers: typeof numbers;
  replies: typeof replies;
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

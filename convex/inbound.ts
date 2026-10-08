import { v } from 'convex/values'
import { internalMutation, mutation } from './_generated/server'
import { receiveText } from './lib/inbox'

const textArgs = { to: v.string(), from: v.string(), body: v.string(), name: v.optional(v.string()) }

// Called by POST /inbound when your iMessage relay receives a text
export const receive = internalMutation({ args: textArgs, handler: (ctx, args) => receiveText(ctx, args) })

// The dashboard's "Test a text": runs a message through exactly the same path as a real one
export const simulate = mutation({ args: textArgs, handler: (ctx, args) => receiveText(ctx, args) })

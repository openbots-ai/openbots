import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval('daily digest check', { hours: 1 }, internal.notifications.digest, {})

export default crons

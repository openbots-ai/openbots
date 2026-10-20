// How long a dashboard request to the engine stays open. The dashboard waits about a minute for an engine to pick it
// up (src/crm/use-engine-task.ts); a request nobody claims by PENDING_MS is closed, so an engine that connects later
// never acts on it (a Twilio purchase long after you gave up, say). One an engine claimed but never answered (it
// crashed or lost its connection) is closed at RUNNING_MS. Both count from when the request was made.
export const TASK_PENDING_MS = 2 * 60_000
export const TASK_RUNNING_MS = 10 * 60_000

// The error a closed request carries
export const TASK_EXPIRED = 'expired'
// The error a request carries when the dashboard stopped waiting before any engine took it
export const TASK_CANCELLED = 'cancelled'

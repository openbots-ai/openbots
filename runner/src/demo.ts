// Sample replies for an agent started with OPENBOTS_DEMO=true when no AI key is set up.
// They read like a real agent acknowledging the request, so a demo works end to end without any keys.
const REPLIES = [
    "on it 👍 give me a few minutes and I'll text you back",
    "got it. I'll take care of that and send you a quick summary when it's done",
    "sure thing. drafting it now, and nothing goes out until you say yes",
    'done ✅ want me to handle it the same way next time?',
    "good call. I've added it to today's list and I'll nudge you if anything's blocked",
    'looking into it now. first update in a couple of minutes',
]

// Picks a reply from the latest message, so the same text always gets the same answer
export function demoReply(lastMessage: string) {
    const hash = [...lastMessage].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
    return REPLIES[hash % REPLIES.length]
}

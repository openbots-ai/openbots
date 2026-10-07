export const MIN = 60_000
export const HOUR = 60 * MIN

// Small deterministic PRNG so every fresh deployment gets the same sample data
export function mulberry32(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export const SEED_WORKSPACE = { name: "Shidhartha's agents", ownerName: 'Shidhartha' }

type Status = 'draft' | 'live' | 'paused'

export const SEED_AGENTS: { name: string; role: string; hue: number; status: Status; folder: string; prompt: string; greeting: string }[] = [
    { name: 'Ava', role: 'Personal assistant', hue: 330, status: 'live', folder: 'Personal', prompt: 'Keeps my week on track: reminders, errands, orders and small favours. Short, friendly texts, never more than two lines.', greeting: "hey, it's ava. what can I take off your plate?" },
    { name: 'Emily', role: 'Chief of staff', hue: 278, status: 'live', folder: 'Work', prompt: 'Runs my calendar and inbox, chases sign-offs, and summarizes long threads into three bullets.', greeting: "hi, emily here. want today's rundown?" },
    { name: 'Jason', role: 'Copywriter', hue: 30, status: 'live', folder: 'Work', prompt: 'Writes captions, emails and landing copy in our voice: lowercase, short, warm, a little cheeky.', greeting: "jason. send me the draft, I'll make it sing" },
    { name: 'Kai', role: 'Researcher', hue: 160, status: 'live', folder: 'Work', prompt: 'Digs into questions and sends a morning brief. Always cites sources and leads with the answer.', greeting: "kai here. what are we looking into?" },
    { name: 'Leo', role: 'Finance & invoices', hue: 45, status: 'live', folder: 'Business', prompt: 'Sends invoices, nudges late payers politely, and flags subscriptions nobody uses.', greeting: "leo. I've got the books, ask me anything" },
    { name: 'Marcus', role: 'Sales & CRM', hue: 200, status: 'live', folder: 'Business', prompt: 'Works new leads, keeps the pipeline current and drafts follow-ups for anyone who went quiet.', greeting: "marcus here. who should we close this week?" },
    { name: 'Nora', role: 'Customer support', hue: 350, status: 'paused', folder: 'Business', prompt: 'Answers customer questions kindly and quickly, escalates anything about billing to me.', greeting: "hi! I'm nora, how can I help?" },
    { name: 'Sam', role: 'Fitness coach', hue: 120, status: 'draft', folder: 'Personal', prompt: 'Checks in after workouts, adjusts the plan, keeps me honest about sleep.', greeting: "sam here. how did today's session go?" },
]

export const SEED_NUMBERS: { handle: string; agent?: string }[] = [
    { handle: '+1 (415) 555-0101', agent: 'Ava' },
    { handle: '+1 (415) 555-0102', agent: 'Emily' },
    { handle: '+1 (415) 555-0119', agent: 'Kai' },
    { handle: '+1 (628) 555-0177', agent: 'Marcus' },
    { handle: 'leo@opendots.com', agent: 'Leo' },
    { handle: 'support@opendots.com', agent: 'Nora' },
    { handle: '+1 (628) 555-0190' },
]

export const SEED_CONTACTS: { name: string; handle: string; tags: string[]; notes?: string }[] = [
    { name: 'Priya Shah', handle: '+1 (415) 555-0142', tags: ['client', 'vip'], notes: 'Prefers mornings. Renewal in March.' },
    { name: 'Daniel Kim', handle: '+1 (212) 555-0187', tags: ['lead'] },
    { name: 'Maya Okafor', handle: '+1 (646) 555-0133', tags: ['client'] },
    { name: 'Lucas Moreau', handle: 'lucas@moreau.studio', tags: ['vendor'] },
    { name: 'Hana Sato', handle: '+1 (503) 555-0161', tags: ['friend'] },
    { name: 'Owen Brooks', handle: '+1 (312) 555-0124', tags: ['lead'] },
    { name: 'Sofia Rossi', handle: '+1 (305) 555-0158', tags: ['client'] },
    { name: 'Ethan Clarke', handle: '+1 (617) 555-0112', tags: ['lead'] },
    { name: 'Amara Nwosu', handle: '+1 (404) 555-0193', tags: ['vip'], notes: 'Board member. Always loop in Emily.' },
    { name: 'Noah Fischer', handle: '+1 (720) 555-0145', tags: ['client'] },
    { name: 'Isla McKenzie', handle: '+1 (206) 555-0176', tags: ['friend'] },
    { name: 'Mateo García', handle: '+1 (512) 555-0139', tags: ['lead'] },
    { name: 'Chloe Dubois', handle: 'chloe@brightandco.com', tags: ['client'] },
    { name: 'Ravi Menon', handle: '+1 (408) 555-0128', tags: ['vendor'] },
    { name: 'Zoe Park', handle: '+1 (213) 555-0164', tags: ['lead'] },
    { name: 'Felix Wagner', handle: '+1 (929) 555-0117', tags: ['client'] },
    { name: 'Lena Novak', handle: '+1 (773) 555-0182', tags: ['friend'] },
    { name: 'Aiden Walsh', handle: '+1 (617) 555-0150', tags: ['lead'] },
    { name: 'Mila Petrova', handle: '+1 (415) 555-0199', tags: ['client', 'vip'] },
    { name: 'Jonah Levi', handle: '+1 (646) 555-0108', tags: ['vendor'] },
]

// Contact line, then the agent's reply
export const SCRIPTS: Record<string, [string, string][]> = {
    Ava: [
        ['can you remind me to call mom on sunday', "done. sunday at 11, I'll text you then"],
        ["what's on my plate tomorrow?", 'dentist at 9:30, standup at 11, and the plumber window is 2 to 4'],
        ['order more coffee beans', 'same ethiopian as last time? they can be here thursday'],
        ['move my gym session to the evening', 'moved to 6:30pm. your 7:30 call still fits after'],
    ],
    Emily: [
        ['anything I need to sign today?', 'just one: the Northwind proposal. it is flagged in your inbox'],
        ['find 30 min with Priya next week', 'she is free tue 2pm or thu 10am. want me to send tue?'],
        ['summarize the board deck feedback', 'three themes: tighten the hiring plan, show churn by cohort, cut slide 14'],
        ['push my 3pm', 'pushed to 4:15 and let everyone know'],
    ],
    Jason: [
        ['need a caption for the launch post', '"we built the thing you kept asking for." want two more options?'],
        ['make this email less stiff', 'done. cut it by a third and dropped the "per my last email"'],
        ['headline ideas for the pricing page', '1) pay for what your agents do 2) one team, one bill 3) cheaper than an intern'],
        ['proofread the newsletter', 'two typos and a broken footer link, all fixed'],
    ],
    Kai: [
        ['what are people saying about the new iOS update?', 'mostly battery complaints, and everyone likes the new lock screen. sources in your notes'],
        ['compare the three CRMs we shortlisted', 'sent a table. short version: Attio for speed, HubSpot if marketing wants in'],
        ['morning brief please', 'rates held, a competitor raised a series B, and your flight is on time'],
        ['find me 5 podcasts on pricing', 'sent a list. start with the first one, it is the best of the bunch'],
    ],
    Leo: [
        ['did Acme pay yet?', 'not yet, 9 days late. want me to send a friendly nudge?'],
        ['yes nudge them', "sent. I'll follow up friday if nothing lands"],
        ['how much did we spend on software in september', '$2,140 across 23 tools. 4 of them nobody has opened in 60 days'],
        ['send the invoice to Bright & Co', 'sent invoice #1042 for $4,800, due in 14 days'],
    ],
    Marcus: [
        ['any new leads today?', 'two: a dental clinic in Austin and a 12-person agency. both booked intro calls'],
        ['update the Northwind deal', 'moved to negotiation, $18k ARR, next step is legal review'],
        ["who haven't we followed up with?", '6 leads went quiet for a week. I drafted follow-ups, want to see them?'],
        ['send them', "sent all 6. I'll flag any replies to you"],
    ],
    Nora: [
        ['hi, my agent stopped replying', 'sorry about that! I restarted it on our end, can you try texting it again?'],
        ['how do I add a second number?', 'go to iMessage Numbers and hit Add number. takes about a minute'],
        ['can I cancel anytime?', 'yep, no contracts. you can cancel from Settings whenever you like'],
        ['thanks that worked', "glad to hear it! I'm here if anything else comes up"],
    ],
}

export const SEED_KNOWLEDGE: { title: string; agent: string; body: string }[] = [
    { title: 'Pricing & plans', agent: 'Nora', body: 'Personal: free, one agent.\nPro: $20/month, unlimited agents and two numbers.\nNo contracts, cancel any time from Settings.' },
    { title: 'Invoice rules', agent: 'Leo', body: 'Net 14 by default.\nNudge at 3 and 9 days late, friendly tone.\nAfter 21 days, hand it to me.' },
    { title: 'Ideal customer profile', agent: 'Marcus', body: 'Owner-led teams of 2 to 30.\nAlready live in iMessage with their customers.\nSkip enterprise procurement.' },
    { title: 'Brand voice', agent: 'Jason', body: 'lowercase, short, warm, never corporate.\nOne joke per message, maximum.\nNo exclamation marks in headlines.' },
    { title: 'My routines', agent: 'Ava', body: 'Gym mon/wed/fri.\nCall mom on sundays.\nNo meetings before 9:30.' },
]

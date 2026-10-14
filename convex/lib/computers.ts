// Computer use runs on the computer the agent's engine runs on: your own Windows PC or Mac. Linux computers (Fedora
// and the like) and Orgo computers answer texts only.

type Computer = { orgo?: unknown; setup?: unknown; os?: string }

// Computers made through Create on Orgo are the cloud ones; the rest are machines the user runs
export const kindOf = (c: Computer): 'own' | 'orgo' => (c.orgo || c.setup ? 'orgo' : 'own')

export const canComputerUse = (c: Computer) => kindOf(c) === 'own' && (c.os === 'windows' || c.os === 'mac')
export const NO_COMPUTER_USE = 'Computer use works on your own Windows or Mac computer.'

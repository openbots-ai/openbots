// Which computer an agent does computer use on: its own pick, else the workspace's, else the account's only computer.
// A pick that points at a computer since deleted is skipped, so deleting a computer never leaves agents stuck.

export type ComputerKind = 'own' | 'orgo'
type Computer = { _id: string; orgo?: unknown; setup?: unknown; os?: string }

// Computers made through Create on Orgo are the cloud ones; the rest are machines the user runs
export const kindOf = (c: Computer): ComputerKind => (c.orgo || c.setup ? 'orgo' : 'own')

// Computer use on your own computer works on Windows and Mac. Linux computers (Fedora and the like) still answer
// texts but aren't supported for computer use; Orgo computers are, through Orgo's own API.
export const canComputerUse = (c: Computer) => kindOf(c) === 'orgo' || c.os !== 'linux'
export const NO_COMPUTER_USE = 'Computer use isn’t supported on Linux. Use a Windows or Mac computer, or Orgo.'

export function resolveComputer<C extends Computer>(computers: C[], workspacePick?: string, agentPick?: string) {
    const usable = computers.filter(canComputerUse)
    const find = (id?: string) => (id ? usable.find((c) => c._id === id) : undefined)
    const own = find(agentPick)
    if (own) return { computer: own, inherited: false }
    const workspace = find(workspacePick) ?? (usable.length === 1 ? usable[0] : undefined)
    return { computer: workspace, inherited: true }
}

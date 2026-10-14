// Which computer an agent does computer use on: its own pick, else the workspace's, else the account's only computer.
// A pick that points at a computer since deleted is skipped, so deleting a computer never leaves agents stuck.

export type ComputerKind = 'own' | 'orgo'
type Computer = { _id: string; orgo?: unknown; setup?: unknown }

// Computers made through Create on Orgo are the cloud ones; the rest are machines the user runs
export const kindOf = (c: Computer): ComputerKind => (c.orgo || c.setup ? 'orgo' : 'own')

export function resolveComputer<C extends Computer>(computers: C[], workspacePick?: string, agentPick?: string) {
    const find = (id?: string) => (id ? computers.find((c) => c._id === id) : undefined)
    const own = find(agentPick)
    if (own) return { computer: own, inherited: false }
    const workspace = find(workspacePick) ?? (computers.length === 1 ? computers[0] : undefined)
    return { computer: workspace, inherited: true }
}

import { cn } from '@/lib/utils'

// Each agent's mascot, shared by every iMessage-style surface so an agent looks the same across the page.
// The name always sits next to the avatar, so the image itself is decorative.
export const AgentAvatar = ({ name, className }: { name: string; className?: string }) => (
    <img
        src={`/avatars/${name.toLowerCase()}.${['tofu', 'lulu', 'rishi'].includes(name.toLowerCase()) ? 'png' : 'webp'}`}
        alt=""
        draggable={false}
        className={cn('shrink-0 rounded-full object-cover', className)}
    />
)

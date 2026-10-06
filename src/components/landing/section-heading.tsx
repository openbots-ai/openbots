import { Reveal } from '@/components/landing/motion'

export const SectionHeading = ({ title, description }: { title: string; description: string }) => (
    <Reveal className="mx-auto max-w-xl text-center">
        <h2 className="type-title text-balance">{title}</h2>
        <p className="type-body-lg text-muted-foreground mt-4 text-balance">{description}</p>
    </Reveal>
)

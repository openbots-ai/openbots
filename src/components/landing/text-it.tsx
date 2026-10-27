import { PhoneDemo } from '@/components/landing/phone-demo'
import { SECTION, SectionHeading } from '@/components/landing/section-heading'

// After the builder in the hero: what using your agents actually looks like, in iMessage
export default function TextIt() {
    return (
        <section
            id="use-cases"
            className={`${SECTION} px-4`}>
            <SectionHeading
                title="Then just text it"
                description="Your agents live in iMessage. Ask for anything, approve what matters, and they get on with it."
            />
            <div className="mt-14">
                <PhoneDemo />
            </div>
        </section>
    )
}

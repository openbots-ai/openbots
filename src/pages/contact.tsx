import { useState } from 'react'
import { ArrowRight, Check, Mail, MessageCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/landing/motion'
import { PageShell } from '@/pages/page-shell'
import { CONTACT_EMAIL } from '@/lib/site'

const field = 'type-body w-full rounded-xl bg-neutral-100/70 px-4 py-3 ring-1 ring-black/5 placeholder:text-neutral-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-900/30 dark:bg-white/5'

const topics = ['Early access', 'Partnerships', 'Press', 'Something else']

export function ContactPage() {
    const [sent, setSent] = useState(false)

    return (
        <PageShell title="Contact">
            <div className="grid gap-14 py-20 md:py-28 lg:grid-cols-[1fr_22rem] lg:gap-20">
                <Reveal>
                    <h1 className="type-title">Get in touch</h1>
                    <p className="type-body-lg text-muted-foreground mt-4 max-w-md text-balance">
                        Questions about OpenDots, early access or working together? Send us a note and a real person will reply, usually within a day.
                    </p>

                    <AnimatePresence
                        mode="wait"
                        initial={false}>
                        {sent ? (
                            <motion.div
                                key="sent"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-10 flex max-w-xl items-start gap-3 rounded-2xl bg-emerald-50 p-6 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30">
                                <Check className="mt-0.5 size-5 text-emerald-600" />
                                <div>
                                    <p className="type-subheading">Thanks, we got your message</p>
                                    <p className="type-body-sm text-muted-foreground mt-1">We will get back to you at the email you gave us.</p>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.form
                                key="form"
                                exit={{ opacity: 0, y: -8 }}
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    setSent(true)
                                }}
                                className="mt-10 grid max-w-xl gap-4 sm:grid-cols-2">
                                <label className="type-label grid gap-2">
                                    Name
                                    <input
                                        required
                                        name="name"
                                        autoComplete="name"
                                        placeholder="Jane Smith"
                                        className={field}
                                    />
                                </label>
                                <label className="type-label grid gap-2">
                                    Work email
                                    <input
                                        required
                                        type="email"
                                        name="email"
                                        autoComplete="email"
                                        placeholder="jane@company.com"
                                        className={field}
                                    />
                                </label>
                                <label className="type-label grid gap-2 sm:col-span-2">
                                    Company
                                    <input
                                        name="company"
                                        autoComplete="organization"
                                        placeholder="Optional"
                                        className={field}
                                    />
                                </label>
                                <fieldset className="sm:col-span-2">
                                    <legend className="type-label">What is it about?</legend>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {topics.map((topic, i) => (
                                            <label
                                                key={topic}
                                                className="type-label cursor-pointer rounded-full bg-neutral-100/70 px-4 py-2 ring-1 ring-black/5 has-checked:bg-primary has-checked:text-primary-foreground has-checked:ring-primary dark:bg-white/5">
                                                <input
                                                    type="radio"
                                                    name="topic"
                                                    value={topic}
                                                    defaultChecked={i === 0}
                                                    className="sr-only"
                                                />
                                                {topic}
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                                <label className="type-label grid gap-2 sm:col-span-2">
                                    Message
                                    <textarea
                                        required
                                        name="message"
                                        rows={5}
                                        placeholder="How can we help?"
                                        className={`${field} resize-none`}
                                    />
                                </label>
                                <div className="sm:col-span-2">
                                    <Button
                                        type="submit"
                                        className="type-label h-auto px-4 py-2 font-normal ring-1 ring-primary has-data-[icon=inline-end]:pr-3">
                                        Send message <ArrowRight data-icon="inline-end" />
                                    </Button>
                                </div>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </Reveal>

                <Reveal className="space-y-4 self-start lg:mt-28">
                    <div className="rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                        <Mail className="size-5" />
                        <p className="type-subheading mt-4">Email us directly</p>
                        <p className="type-body-sm text-muted-foreground mt-1">For anything that does not fit the form.</p>
                        <a
                            href={`mailto:${CONTACT_EMAIL}`}
                            className="type-body mt-4 inline-block font-medium underline decoration-neutral-300 underline-offset-4 hover:decoration-current">
                            {CONTACT_EMAIL}
                        </a>
                    </div>
                    <div className="rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                        <MessageCircle className="size-5" />
                        <p className="type-subheading mt-4">Want to try it?</p>
                        <p className="type-body-sm text-muted-foreground mt-1">Leave your number and we will text you when your agents are ready.</p>
                        <a
                            href="/#early-access"
                            className="type-body mt-4 inline-flex items-center gap-1.5 font-medium">
                            Join early access <ArrowRight className="size-4" />
                        </a>
                    </div>
                </Reveal>
            </div>
        </PageShell>
    )
}

import { useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { ShaderBackground } from '@/components/ui/shader-background'

export default function CallToAction() {
    const [phone, setPhone] = useState('')
    const [sent, setSent] = useState('')

    return (
        <section
            id="early-access"
            className="scroll-mt-24 px-3 pb-24 md:px-6 md:pb-36">
            {/* bg-indigo-950 shows until the WebGL canvas paints (or if WebGL is unavailable) */}
            <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-2xl bg-indigo-950 px-8 py-20 text-white md:px-14 md:py-24">
                <ShaderBackground className="absolute inset-0" />
                <div className="relative max-w-xl">
                    <h2 className="type-title text-balance">Join our early access</h2>
                    <p className="type-body-lg mt-5 max-w-md text-white/75">
                        We are letting a small group of teams in first. Leave your number and we will text you the moment your agents are ready.
                    </p>

                    {/* iMessage-style compose bar: your number "sends" as a blue bubble and OpenBots replies */}
                    <div className="mt-10 max-w-md">
                        <AnimatePresence initial={false}>
                            {sent && (
                                <motion.div
                                    key="thread"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="flex flex-col gap-2 pb-3">
                                    <motion.p
                                        initial={{ opacity: 0, y: 12, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                                        style={{ originX: 1, originY: 1 }}
                                        className="self-end rounded-[18px] bg-[#0A84FF] px-3.5 py-2 text-[15px]">
                                        {sent}
                                    </motion.p>
                                    <motion.p
                                        initial={{ opacity: 0, y: 12, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        transition={{ type: 'spring', stiffness: 420, damping: 30, delay: 0.9 }}
                                        style={{ originX: 0, originY: 1 }}
                                        className="max-w-[85%] self-start rounded-[18px] bg-white/15 px-3.5 py-2 text-[15px] backdrop-blur">
                                        you're on the list 🎉 we'll text you here the moment your agents are ready
                                    </motion.p>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {!sent && (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault()
                                    setSent(phone.trim())
                                }}
                                className="flex items-center gap-2 rounded-full bg-white/10 py-1.5 pl-5 pr-1.5 ring-1 ring-white/20 backdrop-blur-md transition-shadow focus-within:ring-white/40">
                                <label
                                    htmlFor="early-access-phone"
                                    className="sr-only">
                                    Phone number
                                </label>
                                <input
                                    id="early-access-phone"
                                    type="tel"
                                    required
                                    autoComplete="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="Text us your number"
                                    className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-white placeholder:text-white/50 focus:outline-none"
                                />
                                <button
                                    type="submit"
                                    aria-label="Join early access"
                                    disabled={!phone.trim()}
                                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#0A84FF] transition-[background-color,transform] hover:scale-105 disabled:cursor-default disabled:bg-white/20 disabled:hover:scale-100">
                                    <ArrowUp
                                        className="size-5"
                                        strokeWidth={2.5}
                                    />
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </motion.div>
        </section>
    )
}

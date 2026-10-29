# Voiceover script (ElevenLabs)

The video is 44 seconds. Each line is written to fit inside its scene at a relaxed launch-video pace (about 2.5 words a
second), with room to breathe around the cuts. The montage is left without a line on purpose: its fast ticks carry it.

## Voice settings

- **Model:** Eleven v3 (most expressive) or Multilingual v2 (most consistent).
- **Voice:** a warm, confident, conversational narrator, closer to a friend than an announcer. Mid-pitch, unhurried.
- **Settings (v2):** Stability ~45%, Similarity ~75%, Style ~20%, Speaker boost on.
- **Best results:** generate each line as its own clip so it can be placed exactly on its scene. Send the clips back
  and they get placed at the times below and mixed over the sound effects.

## The script

| # | Starts at | Scene | Line |
| --- | --- | --- | --- |
| 1 | 0:00.6 | Introducing | Introducing… |
| 2 | 0:03.0 | Logo | OpenBots. A personal AI that's actually yours, and designed for your workflows. |
| 3 | 0:07.7 | Your models / Your rules | Your models. Your rules. |
| 4 | 0:10.9 | Builder | Build it piece by piece. Pick every model, set every rule. |
| 5 | 0:15.7 | Just text it | Then just text it. You pick what it knows, how it talks, and its guardrails. |
| 6 | 0:21.5 | Computer use | It can use your computer, where you're already logged in. And it checks with you before anything big. |
| 7 | 0:29.2 | Any model | Choose your specific model for each layer of the stack. |
| 8 | 0:32.1 | Private by design | Your conversations stay on your machine, by design. |
| – | 0:34.8 | Montage | *(no line)* |
| 9 | 0:37.6 | End card | Personal AI that actually feels personal. OpenBots. |

Lines 2 and 7 are the longest for their scenes. If a take runs long, it's fine for them to spill a second into the next
scene; when the clips come back, the next line just starts a beat later.

## One block to paste (if generating it as a single take)

```
Introducing…

OpenBots.

A personal AI that's actually yours, and designed for your workflows.

Your models. Your rules.

Build it piece by piece. Pick every model, set every rule.

Then just text it.

You pick what it knows, how it talks, and its guardrails.

It can use your computer, where you're already logged in. And it checks with you before anything big.

Choose your specific model for each layer of the stack.

Your conversations stay on your machine, by design.

Personal AI that actually feels personal. OpenBots.
```

## Making it sound natural in ElevenLabs

- Pick a conversational voice from the Voice Library (filter by "Conversational"), not a "Narration" or "Advertisement" one.
- Eleven v3: start with `[casual]` and let the punctuation do the pacing. Multilingual v2: Stability around 35%, Style around 10%; higher stability sounds more read-off-a-page.
- Generate each line two or three times and keep the take that sounds least performed.

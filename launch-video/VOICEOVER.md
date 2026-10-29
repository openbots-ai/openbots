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
| 1 | 0:00.3 | Introducing | Meet the AI you actually text. |
| 2 | 0:03.2 | Logo | This is OpenBots. |
| 3 | 0:06.9 | Your AI / models / rules / phone | Your AI. Your models. Your rules. Right on your phone. |
| 4 | 0:10.9 | Builder | Build it piece by piece. Every model, every rule, your call. |
| 5 | 0:15.7 | Just text it | Then just text it. iMessage or SMS, no new app. |
| 6 | 0:21.5 | Computer use | It even works on your computer, where you're already signed in. It does the task, then waits for your yes. |
| 7 | 0:29.2 | Any model | Bring any model, with your own keys. |
| 8 | 0:32.1 | Private by design | Your conversations stay on your machine, encrypted. |
| – | 0:34.8 | Montage | *(no line)* |
| 9 | 0:37.6 | End card | OpenBots. Available now. |

Line 3 lands best with each phrase on its word swap: "Your AI" at 0:06.8, "Your models" at 0:07.7, "Your rules" at
0:08.7, "Right on your phone" at 0:09.7.

## One block to paste (if generating it as a single take)

```
Meet the AI you actually text.

This is OpenBots.

Your AI. Your models. Your rules. Right on your phone.

Build it piece by piece. Every model, every rule, your call.

Then just text it. iMessage or SMS, no new app.

It even works on your computer, where you're already signed in. It does the task, then waits for your yes.

Bring any model, with your own keys.

Your conversations stay on your machine, encrypted.

OpenBots. Available now.
```

With Eleven v3 you can steer the read with audio tags, for example `[warm]` before line 1 and `[confident]` before
line 9. With Multilingual v2, add pauses between lines with `<break time="1.0s" />`.

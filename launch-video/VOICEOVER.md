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
| 2 | 0:03.0 | Logo | OpenBots. Personal AI that's actually yours. |
| 3 | 0:07.7 | Your models / Your rules | Your models. Your rules. |
| 4 | 0:10.9 | Builder | Build it piece by piece. Pick every model, set every rule. |
| 5 | 0:15.7 | Just text it | Then just text it. |
| 6 | 0:21.5 | Computer use | Run it in the cloud, or right on your own computer, where you're already signed in. |
| 7 | 0:29.2 | Any model | Bring any model, with your own keys. |
| 8 | 0:32.1 | Private by design | Your conversations stay on your machine. |
| – | 0:34.8 | Montage | *(no line)* |
| 9 | 0:37.6 | End card | OpenBots. Personal AI, kept personal. |

Line 3 lands best with each phrase on its word swap: "Your models" at 0:07.7, "Your rules" at 0:08.7.

## One block to paste (if generating it as a single take)

```
Introducing…

OpenBots. Personal AI that's actually yours.

Your models. Your rules.

Build it piece by piece. Pick every model, set every rule.

Then just text it.

Run it in the cloud, or right on your own computer, where you're already signed in.

Bring any model, with your own keys.

Your conversations stay on your machine.

OpenBots. Personal AI, kept personal.
```

With Eleven v3 you can steer the read with audio tags, for example `[warm]` before line 2 and `[confident]` before
line 9. With Multilingual v2, add pauses between lines with `<break time="1.0s" />`.

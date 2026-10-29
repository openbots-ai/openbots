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

The voice doesn't describe what's on screen; it says why it matters, and the picture shows how.

| # | Starts at | Scene | Line |
| --- | --- | --- | --- |
| 1 | 0:00.3 | Introducing | Most AI lives in someone else's app. |
| 2 | 0:03.2 | Logo | OpenBots lives with you. |
| 3 | 0:07.0 | Word swaps | It works the way you tell it to. |
| 4 | 0:10.9 | Builder | You decide what it knows, how it talks, and what it's never allowed to do. |
| 5 | 0:15.7 | Just text it | And when you need something, you don't open an app. You send a text. |
| 6 | 0:21.5 | Computer use | It works from your own computer, where you're already signed in, and asks before anything it can't undo. |
| 7 | 0:29.2 | Any model | Use whichever AI you trust. |
| 8 | 0:32.1 | Private by design | Your conversations are stored on your machine, not ours. |
| – | 0:34.8 | Montage | *(no line)* |
| 9 | 0:37.6 | End card | OpenBots. Personal AI, kept personal. |

## One block to paste (if generating it as a single take)

```
Most AI lives in someone else's app.

OpenBots lives with you.

It works the way you tell it to.

You decide what it knows, how it talks, and what it's never allowed to do.

And when you need something, you don't open an app. You send a text.

It works from your own computer, where you're already signed in, and asks before anything it can't undo.

Use whichever AI you trust.

Your conversations are stored on your machine, not ours.

OpenBots. Personal AI, kept personal.
```

With Eleven v3 you can steer the read with audio tags, for example `[warm]` before line 2 and `[confident]` before
line 9. With Multilingual v2, add pauses between lines with `<break time="1.0s" />`.

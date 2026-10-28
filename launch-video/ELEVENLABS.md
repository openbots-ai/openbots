# Music for the launch video (ElevenLabs)

The video is exactly **44.0 seconds**. Each music section below matches one scene, so the hits land on the cuts.

## Option A: the ElevenLabs website (easiest)

Open Eleven Music, set the length to **44 seconds**, turn on instrumental (no vocals), and paste this:

```
Instrumental modern tech product launch track, 44 seconds, 120 BPM, cinematic electronic, clean polished mix, warm synths, punchy tight drums, optimistic and confident. No vocals.
0:00-0:03 soft airy pad swelling from silence with a shimmering reverse riser, no drums.
0:03 big impact hit with a deep sub boom and a wide bright chord, then a gentle pulse until 0:07.
0:07-0:10 four staccato synth plucks on the beat, rising tension, filtered kick.
0:10 the main groove kicks in: four on the floor, bright arpeggio, clean bass. Keep it building through 0:21, adding playful bell melody and light percussion ticks.
0:21-0:29 more energy, hi-hats, driving bass, a sense of things getting done; a small satisfying accent at 0:28.5.
0:29-0:32 lift into a big open chorus with layered synth chords.
0:32-0:35 breakdown: drums drop out, warm pad and soft piano, riser in the last second.
0:35-0:38 full energy return, fast driving drums, stabs, peak intensity.
0:38 final big impact hit on a resolving major chord, then a long shimmering tail fading to silence by 0:44.
```

Generate a few takes and pick the one where the hits at **0:03** and **0:38** land best.

## Option B: the API with a composition plan (tightest timing)

`composition-plan.json` has 10 sections whose lengths add up to 44,000 ms, one per scene. Send it as
`composition_plan` (not with a text prompt; the two can't be combined) to the Eleven Music API on a paid plan.

| Section | Time | Scene on screen |
| --- | --- | --- |
| Intro bloom | 0:00–0:03 | Gradient blooms, "Introducing" |
| Logo reveal | 0:03–0:07 | Logo, "OpenBots 2.0 is here" (hit) |
| Word swaps | 0:07–0:10 | Your AI / models / rules / phone |
| Feature: builder | 0:10–0:15 | Dashboard, model slots |
| Feature: just text it | 0:15–0:21 | Landing-page iPhone: you ask Tofu to send Dana your 1099s |
| Feature: computer use | 0:21–0:29 | Mac: Tofu downloads both 1099s from your brokerage and emails Dana; your YES sends it at 0:28.5 |
| Feature: any model | 0:29–0:32 | Model logos |
| Feature: private | 0:32–0:35 | Lock (breakdown) |
| Rapid montage | 0:35–0:38 | 10 feature words, 0.3s each |
| End card | 0:38–0:44 | Logo, "Available now" (final hit) |

## Putting the music on the video

`music.mp3` is the ElevenLabs track. `score.py` fits it to the cuts, then ffmpeg puts it on the video:

```
python3 score.py music.mp3 score.wav
ffmpeg -i openbots-launch.mp4 -i score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest openbots-launch-with-music.mp4
```

What `score.py` does to the track:

- Starts it 0.47s in, which puts its own moments on the video's: a kick on the logo (0:03), its drop on "Just text it"
  (0:15), its chorus on the model logos (~0:29) and its last hit on the end card (0:38).
- Intro (0:00–0:03): fades in muffled, then opens up on the logo with a noise riser and a sub boom.
- "Private by design" (0:32–0:35): muffled into a breakdown, with a riser back into the montage.
- Montage (0:35–0:38): uses the chorus's strongest bar, because the original track winds down there.
- End card (0:38–0:44): a sub boom on the last hit and a long reverb tail, fading to silence.
- Loudness: normalised to -14 LUFS (the usual target for social video), with a limiter so it never clips.

If the scene timing in `index.html` changes, update `SEGMENTS` and the times in `score.py` to match.

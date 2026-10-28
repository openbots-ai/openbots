# Music for the launch video (ElevenLabs)

The video is exactly **44.0 seconds**. Each music section below matches one scene, so the hits land on the cuts.

## Option A: the ElevenLabs website (easiest)

Open Eleven Music, set the length to **44 seconds**, turn on instrumental (no vocals), and paste this:

```
Instrumental modern tech product launch track, 44 seconds, 120 BPM, cinematic electronic, clean polished mix, warm synths, punchy tight drums, optimistic and confident. No vocals.
0:00-0:03 soft airy pad swelling from silence with a shimmering reverse riser, no drums.
0:03 big impact hit with a deep sub boom and a wide bright chord, then a gentle pulse until 0:07.
0:07-0:10 four staccato synth plucks on the beat, rising tension, filtered kick.
0:10 the main groove kicks in: four on the floor, bright arpeggio, clean bass. Keep it building through 0:22, adding playful bell melody and light percussion ticks.
0:22-0:27 more energy, hi-hats, driving bass.
0:27-0:31 lift into a big open chorus with layered synth chords.
0:31-0:35 breakdown: drums drop out, warm pad and soft piano, riser in the last second.
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
| Feature: builder | 0:10–0:15.8 | Dashboard, model slots |
| Feature: just text it | 0:15.8–0:21.8 | Landing-page iPhone: Messages list, then Tofu's chat |
| Feature: computer use | 0:21.8–0:27.4 | MacBook: Tofu sorts the desktop screenshots in Finder |
| Feature: any model | 0:27.4–0:31.4 | Model logos |
| Feature: private | 0:31.4–0:35 | Lock (breakdown) |
| Rapid montage | 0:35–0:38 | 10 feature words, 0.3s each |
| End card | 0:38–0:44 | Logo, "Available now" (final hit) |

## Putting the music on the video

Save the track as `launch-video/music.mp3`, then from `launch-video/`:

```
ffmpeg -i openbots-launch.mp4 -i music.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -af "afade=t=out:st=42.5:d=1.5" -shortest openbots-launch-with-music.mp4
```

If the timing changes in `index.html`, update the section lengths here to match.

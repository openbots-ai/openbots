# Background music

`launch-music-separated.flac` is the music from the "OpenBots Launch 4K" audio the user supplied (made with Claude Code),
with its voice removed by Demucs (htdemucs). It is 124 BPM on the same grid as the video, first beat at 0.02 s.

`launch-music-no-dings.flac` is the one in use: the same music rebuilt from Demucs' drums, bass and "other" stems, with
the bright bell-like dings in the opening (first 11.5 s) filtered out of the "other" stem (lowpass ~1 kHz, easing back
to the full sound over 0.6 s). Drums and bass are untouched.

Build the bed and the final mix:

    ffmpeg -i assets/music/launch-music-no-dings.flac -af "atrim=start=0.02,asetpts=PTS-STARTPTS" score-new.wav
    python3 el_vo.py timeline.json sfx-real.wav final-mix.wav score-new.wav

## In use now: the groovy track with a calm start

`groovy-quiet-start.flac` is the original ElevenLabs groovy track (`music.mp3`) with no music at all while the opening
talks: it is silent until the logo (8.71 s, a beat on the 124 BPM grid), where the full groove drops in. Then:

    python3 score.py assets/music/groovy-quiet-start.flac score.wav
    python3 el_vo.py timeline.json sfx-real.wav final-mix.wav score.wav

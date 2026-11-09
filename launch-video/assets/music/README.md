# Background music

`launch-music-separated.flac` is the music from the "OpenBots Launch 4K" audio the user supplied (made with Claude Code),
with its voice removed by Demucs (htdemucs, two stems). It is 124 BPM on the same grid as the video, first beat at 0.02s.
Build the bed with: ffmpeg -i assets/music/launch-music-separated.flac -af "atrim=start=0.02,asetpts=PTS-STARTPTS" score-new.wav
then `python3 el_vo.py timeline.json sfx-real.wav final-mix.wav score-new.wav`.

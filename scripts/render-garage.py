"""Render the garage score with pyFluidSynth, TimGM6mb, NumPy and ffmpeg."""
import argparse
from pathlib import Path
import subprocess

import fluidsynth
import numpy as np

RATE = 44100
BPM = 144
BARS = 24
FRAMES = round(BARS * 4 * 60 / BPM * RATE)
BASS, GUITAR, STRINGS, HORNS, DRUMS = 0, 1, 2, 3, 9

# Two-bar call and response. Pitches are transposed with each harmony.
CALL = [(0, 7, .68), (.75, 10, .19), (1, 12, .85), (2.5, 7, .38), (3.25, 5, .58)]
ANSWER = [(0, 3, .38), (.5, 5, .36), (1.25, 7, 1.1), (2.75, 5, .39), (3.5, 3, .32)]


def score():
    events = []
    rng = np.random.default_rng(22)

    def note(channel, beat, key, duration, velocity):
        frame = round(beat * 60 / BPM * RATE)
        end = round((beat + duration) * 60 / BPM * RATE)
        events.append((frame, channel, key, velocity))
        events.append((end, channel, key, 0))

    # D minor, B flat, F and C. Bring the rhythm section forward for the
    # four-bar breakdown, then answer the opening riff in a higher register.
    roots = [38, 34, 41, 36]
    for bar in range(BARS):
        at = bar * 4
        harmony = (bar // 2) % 4
        root = roots[harmony]
        third = 3 if harmony == 0 else 4
        breakdown = 16 <= bar < 20
        lift = 8 <= bar < 16 or bar >= 20

        kicks = [0, 2] if breakdown else [0, 1.5, 2.75] if bar % 2 else [0, .75, 2, 3.5]
        for step in kicks:
            note(DRUMS, at + step, 36, .16, 119 if step in (0, 2) else 100)
        for step in ([2] if breakdown else [1, 3]):
            note(DRUMS, at + step + .011, 38, .19, 117)
        if bar % 2 and not breakdown:
            note(DRUMS, at + 2.75, 38, .10, 49)
        for eighth in range(8):
            if breakdown and eighth % 2:
                continue
            note(DRUMS, at + eighth / 2 + .009 * (eighth % 2),
                 46 if lift and eighth == 7 else 42, .18,
                 (81 if eighth % 2 == 0 else 62) + int(rng.integers(-4, 5)))
        if bar in (0, 8, 20):
            note(DRUMS, at, 49, .75, 96)
        if bar % 4 == 3:
            for i, drum in enumerate([48, 47, 45, 41]):
                note(DRUMS, at + 3 + i / 4, drum, .20, 88 + 7 * i)

        bass = [(0, 0, .68), (.75, 0, .20), (1.5, 12, .39),
                (2, 0, .32), (2.5, 7, .34), (3.25, 0, .22), (3.5, 7, .37)]
        for step, interval, length in bass:
            note(BASS, at + step, root + interval, length, 114 if step == 0 else 98)

        for step in ([.5, 2.5] if breakdown else [.5, 1.25, 2.5, 3.25]):
            for string, interval in enumerate([0, 7, 12]):
                note(GUITAR, at + step + .014 * string, root + 12 + interval, .23, 90 - 3 * string)

        if not breakdown:
            for step, interval, length in (CALL if bar % 2 == 0 else ANSWER):
                # Keep the hook diatonic over major chords.
                semitones = {3: third, 10: 10 if harmony in (0, 3) else 11}.get(interval, interval)
                note(STRINGS, at + step, root + 24 + semitones, length, 107)
            if lift:
                for step, length in [(0, .64), (1.75, .34), (3, .50)]:
                    for voice, interval in enumerate([0, third, 7]):
                        note(HORNS, at + step + .006 * voice, root + 24 + interval, length, 94 - voice * 3)
        else:
            for interval in [0, third, 7]:
                note(STRINGS, at, root + 24 + interval, 2.65, 78)
    return sorted(events)


def render(soundfont):
    synth = fluidsynth.Synth(gain=.55, samplerate=RATE)
    try:
        bank = synth.sfload(str(soundfont))
        if bank < 0:
            raise RuntimeError(f"Cannot load {soundfont}")
        for channel, program, volume, pan in [(BASS, 33, 111, 64), (GUITAR, 28, 94, 39),
                                              (STRINGS, 48, 92, 77), (HORNS, 61, 84, 54),
                                              (DRUMS, 0, 115, 64)]:
            synth.program_select(channel, bank, 128 if channel == DRUMS else 0, program)
            synth.cc(channel, 7, volume)
            synth.cc(channel, 10, pan)
            synth.cc(channel, 91, 20 if channel in (BASS, DRUMS) else 38)
        events = score()
        # Warm up once so the final loop opens with the preceding room tails.
        for _ in range(2):
            blocks = []
            cursor = 0
            for frame, channel, key, velocity in events:
                if frame > cursor:
                    blocks.append(synth.get_samples(frame - cursor))
                    cursor = frame
                if velocity:
                    synth.noteon(channel, key, velocity)
                else:
                    synth.noteoff(channel, key)
            blocks.append(synth.get_samples(FRAMES - cursor))
        pcm = np.concatenate(blocks).astype(np.float32) / 32768
        return .85 * pcm / max(.001, np.max(np.abs(pcm)))
    finally:
        synth.delete()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--soundfont', type=Path, default=Path('/usr/share/sounds/sf2/TimGM6mb.sf2'))
    args = parser.parse_args()
    target = Path(__file__).resolve().parents[1] / 'assets' / 'garage.mp3'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(RATE),
                    '-ac', '2', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-q:a', '3', str(target)],
                   input=render(args.soundfont).astype('<f4').tobytes(), check=True)

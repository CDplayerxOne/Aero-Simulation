"""Render the original Groundline garage loop. Requires NumPy, SciPy and ffmpeg."""
from pathlib import Path
import subprocess

import numpy as np
from scipy.signal import butter, sosfilt

RATE = 32000
BEAT = 60 / 92
LENGTH = round(16 * 4 * BEAT * RATE)
mix = np.zeros((LENGTH, 2))
rng = np.random.default_rng(22)


def time(seconds):
    return np.arange(round(seconds * RATE)) / RATE


def put(signal, beat, pan=0):
    """Wrap release tails across the loop boundary."""
    start = round(beat * BEAT * RATE) % LENGTH
    stereo = signal[:, None] * np.sqrt([(1-pan)/2, (1+pan)/2])
    first = min(len(signal), LENGTH-start)
    mix[start:start+first] += stereo[:first]
    mix[:len(signal)-first] += stereo[first:]


def phase(note, t):
    return 2 * np.pi * 440 * 2**((note-69)/12) * t


def noise(t, low, high):
    band = butter(2, [low, high], fs=RATE, btype="bandpass", output="sos")
    return sosfilt(band, rng.normal(size=t.size))


# D minor ninth, B-flat major seventh, F major ninth and C suspended.
chords = [(38, [53,57,60,64]), (34, [53,57,62,65]),
          (41, [52,55,57,60]), (36, [50,53,55,62])]
for bar in range(16):
    root, chord = chords[(bar//2) % 4]
    at = 4 * bar
    pad = time(4.5 * BEAT)
    for voice, note in enumerate(chord):
        angle = phase(note, pad)
        envelope = np.minimum(1, pad/.19) * np.minimum(1, (pad[-1]-pad)/.48)
        tone = .7*np.sin(angle) + .22*np.sin(1.002*angle) + .08*np.sin(2*angle)
        put(.059*tone*envelope, at, (voice-1.5)*.36)

    for step, note in [(0,root), (1.75,root+12), (2.5,root+7)]:
        t = time(.82)
        angle = phase(note,t)
        bass = (np.sin(angle)+.2*np.sin(2*angle)) * (1-np.exp(-t*80))*np.exp(-t*7)
        put(.32*bass, at+step)

    # Bell-like keys with a quiet, panned return.
    for index, step in enumerate((.5,1.5,3.25) if bar%2 else (.75,2.25)):
        note = chord[(bar+2*index)%4]+(12 if bar%4==3 else 0)
        t = time(1.1)
        angle = phase(note,t)
        key = np.sin(angle+.88*np.exp(-t*10)*np.sin(2*angle))
        key *= .145*(1-np.exp(-t*150))*np.exp(-t*4.7)
        put(key,at+step,-.24)
        put(.24*key,at+step+.375,.58)

    for step in (0,2.5):
        t = time(.30)
        kick = np.sin(2*np.pi*(48*t+2*(1-np.exp(-t*38))))
        put(.33*kick*np.exp(-t*17)*(1-np.exp(-t*300)),at+step)
    for step in (1,3):
        t = time(.16)
        rim = np.sin(2*np.pi*385*t)*np.exp(-t*76) + .48*noise(t,850,3600)*np.exp(-t*33)
        put(.12*rim*(1-np.exp(-t*500)),at+step,.16)
    for eighth in range(8):
        t = time(.08)
        hat = noise(t,4900,10500)*np.exp(-t*72)
        put((.048 if eighth%2 else .027)*hat,at+eighth*.5+.026*(eighth%2),-.32)

# A pneumatic tool spins up and releases, with quieter metal ticks across the bay.
for beat in (7.2, 32.8, 52.1):
    t = time(.68)
    speed = 1-np.exp(-t*19)
    motor = np.sin(2*np.pi*(118*t-3.7*speed))
    burst = (.15+.85*np.maximum(motor,0)**3)*noise(t,780,5100)
    put(.24*burst*speed*np.minimum(1,(t[-1]-t)/.13),beat,.62)
    for delay in (1.07,1.36):
        t = time(.20)
        click = np.sin(2*np.pi*1127*t)+.52*np.sin(2*np.pi*1783*t)
        put(.055*click*np.exp(-t*58),beat+delay,-.56)

mix = .82 * mix / np.max(np.abs(mix))
target = Path(__file__).resolve().parents[1] / 'assets' / 'garage.mp3'
subprocess.run(['ffmpeg','-loglevel','error','-y','-f','f32le','-ar',str(RATE),
                '-ac','2','-i','pipe:0','-codec:a','libmp3lame','-q:a','4',str(target)],
               input=mix.astype('<f4').tobytes(),check=True)

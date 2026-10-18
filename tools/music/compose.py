#!/usr/bin/env python3
"""compose.py -> data/music.json: Ashvale's soundtrack, one original track per area (2026-10-18, the operator: "generate music
tracks referencing old school runescape music - that unlocks new tracks when you visit new areas and towns").

In the manner of the old MIDI soundtracks - a modal lead tune over a bass line, held string chords, light hand percussion - but
every note is composed here, by rule, from each track's own seed: nothing is transcribed from any existing piece. Track names and
moods were drafted by the local Qwen model and edited by hand (tools/music/README in the commit message).

Each track: a key, a mode, a meter and a tempo; a chord progression in the mode; a two-bar motif built on the chords and varied
phrase by phrase; form A A B A (32 bars). Events are [step, length, midi, velocity] with a step a sixteenth note; percussion is a
one-bar pattern of [step, voice, velocity] the player repeats. src/engmusic.js plays them through its own WebAudio synth.
    python3 tools/music/compose.py
"""
import json, os, random, hashlib
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MODES = {'ionian': [0, 2, 4, 5, 7, 9, 11], 'dorian': [0, 2, 3, 5, 7, 9, 10], 'mixolydian': [0, 2, 4, 5, 7, 9, 10],
         'aeolian': [0, 2, 3, 5, 7, 8, 10], 'phrygian': [0, 1, 3, 5, 7, 8, 10], 'lydian': [0, 2, 4, 6, 7, 9, 11]}
PROGS = {'ionian': [[0, 3, 4, 0], [0, 5, 3, 4], [0, 4, 5, 3]], 'dorian': [[0, 3, 0, 6], [0, 6, 3, 0], [0, 2, 3, 6]],
         'mixolydian': [[0, 6, 3, 0], [0, 3, 6, 0], [0, 4, 6, 3]], 'aeolian': [[0, 5, 6, 0], [0, 3, 6, 2], [0, 5, 3, 4]],
         'phrygian': [[0, 1, 0, 6], [0, 6, 5, 1], [0, 3, 1, 0]], 'lydian': [[0, 1, 0, 4], [0, 4, 1, 0], [0, 1, 5, 4]]}
CELLS = {4: [[4, 4, 4, 4], [8, 4, 4], [4, 2, 2, 8], [6, 2, 4, 4], [4, 4, 8], [2, 2, 4, 8], [12, 4], [4, 4, 2, 2, 4], [6, 2, 6, 2]],
         3: [[4, 4, 4], [8, 4], [6, 2, 4], [4, 8], [4, 2, 2, 4], [2, 2, 8]]}
PERC = {   # one bar: [step, voice, velocity]; voices: k kick, s snare, h hat, t tom, b tambourine, d frame drum
    'none': {4: [], 3: []},
    'folk': {4: [[0, 'd', 0.7], [8, 'd', 0.5], [4, 'h', 0.25], [12, 'h', 0.25], [14, 'h', 0.15]], 3: [[0, 'd', 0.7], [4, 'h', 0.25], [8, 'h', 0.25]]},
    'march': {4: [[0, 'k', 0.6], [8, 'k', 0.5], [4, 's', 0.45], [12, 's', 0.45], [14, 's', 0.2], [15, 's', 0.25]], 3: [[0, 'k', 0.6], [4, 's', 0.4], [8, 's', 0.4]]},
    'tavern': {4: [[0, 'k', 0.55], [4, 'b', 0.4], [8, 'k', 0.45], [12, 'b', 0.4], [10, 'b', 0.2]], 3: [[0, 'k', 0.55], [4, 'b', 0.35], [8, 'b', 0.35]]},
    'dark': {4: [[0, 't', 0.6], [10, 't', 0.35]], 3: [[0, 't', 0.6], [8, 't', 0.3]]},
    'gentle': {4: [[0, 'd', 0.35], [8, 'h', 0.12]], 3: [[0, 'd', 0.35]]},
}
# area, name (Qwen's draft, edited), mood, lead, bpm, mode, meter, percussion, pad, bass style
TRACKS = [
    ('village', 'Hearth and Well', 'Warm hearthlight and friendly faces round the well.', 'harp', 84, 'ionian', 4, 'gentle', True, 'walk'),
    ('wild', 'The Long Road Out', 'Bright and brisk, the road ahead and the hills beyond.', 'horn', 118, 'mixolydian', 4, 'march', True, 'pulse'),
    ('eastend', 'Pastoral Wind Chimes', 'Lanes and hedgerows in golden spring sunlight.', 'flute', 98, 'dorian', 3, 'folk', True, 'walk'),
    ('whisperwood', 'Shadows Under Whisperwood', 'Tall pines, rustling leaves and something snarling far off.', 'oboe', 104, 'phrygian', 3, 'dark', True, 'drone'),
    ('saltmere', "Creaking Sailmaker's Song", 'Salt wind, hammering on the docks and a full tavern.', 'lute', 112, 'mixolydian', 4, 'tavern', False, 'pulse'),
    ('castle', 'Royal Lake Serenade', 'Banners over the water and polite talk in the court.', 'horn', 90, 'ionian', 4, 'march', True, 'walk'),
    ('lakes', 'Stone Bridge Overture', 'Wide water, the sky in it, and the bridge across.', 'flute', 80, 'lydian', 4, 'gentle', True, 'drone'),
    ('wolfden', 'Hill of the Pack', 'Cold high air and the den watching you come.', 'recorder', 76, 'aeolian', 4, 'dark', True, 'drone'),
    ('cavemouth', 'Stone Path Echoes', 'Damp echoes off mossy rock where the light gives out.', 'pipe', 70, 'phrygian', 4, 'dark', True, 'drone'),
    ('spidercave', "Silken Queen's Waltz", 'Webs in the dark and too many legs.', 'lute', 120, 'phrygian', 3, 'dark', True, 'pulse'),
    ('ancientchapel', 'Ruined Bell Reverie', 'Crumbling stone and an old hush on the hill.', 'flute', 64, 'aeolian', 4, 'none', True, 'drone'),
    ('evengrove', 'The Blank on the Map', 'A calm that is not quite right, kept off every chart.', 'harp', 72, 'lydian', 3, 'none', True, 'drone'),
    ('ziibiing', 'Birch River Lullaby', 'Canoes on calm water and quiet voices by the river.', 'recorder', 88, 'dorian', 4, 'gentle', True, 'walk'),
    ('lodges', 'Elder Tale Fire', 'Crackling logs and old stories told slowly.', 'strings', 78, 'mixolydian', 4, 'gentle', False, 'drone'),
    ('ricelake', 'Canoe Glide Melody', 'Paddles in shallow water among the rice.', 'flute', 94, 'ionian', 3, 'gentle', True, 'walk'),
    ('sugarcamp', 'Sap Run Steam', 'Early spring, woodsmoke and the hiss of the kettles.', 'horn', 102, 'dorian', 4, 'folk', True, 'pulse'),
    ('flintbank', "Knapper's Spark", 'Stone on stone in the river breeze.', 'pipe', 116, 'dorian', 4, 'folk', False, 'pulse'),
    ('obsidianbank', 'Black Glass Tide', 'Cold dark reflections on a shore of black glass.', 'oboe', 70, 'aeolian', 4, 'none', True, 'drone'),
    ('willowbank', 'Bending Green Whispers', 'Willows over slow water.', 'flute', 84, 'lydian', 3, 'none', True, 'walk'),
    ('dragonapproach', "Squire's Watch Song", 'A lonely vigil under a wide open sky.', 'recorder', 100, 'dorian', 4, 'march', True, 'walk'),
    ('dragonkeep', "Ember King's Ruin", 'Ash, broken iron and the chain that holds it.', 'strings', 86, 'phrygian', 4, 'dark', True, 'drone'),
    # the great mountain (2026-10-18; names drafted by the local Qwen model, edited): its slopes (a region), the shrine and ledge, the pass
    ('mountain', 'The Switchback Road', 'Snow on the heights and the long road climbing.', 'horn', 92, 'dorian', 4, 'march', True, 'drone'),
    ('mt_shrine', "The Hermit's Altar", 'Three stones, thin air and a hush above the clouds.', 'flute', 66, 'lydian', 3, 'none', True, 'drone'),
    ('mt_pass', 'Teeth of the Pass', 'Wolves, knives and a wind that wants you off the ledge.', 'strings', 124, 'phrygian', 4, 'dark', True, 'pulse'),
]
ROOTS = [60, 62, 64, 65, 67, 57, 59]   # C D E F G A B (lead octave)
# night versions (2026-10-18, the operator: "make sure there is some song versions for night time"): the same tune - the same seed,
# so the same motif, rhythm and contour - in the darker sister mode, three-quarter time slower, a softer voice, held chords and
# little or no percussion. Names and moods drafted by the local Qwen model from the day titles, edited by hand.
DARKER = {'ionian': 'aeolian', 'lydian': 'dorian', 'mixolydian': 'dorian', 'dorian': 'aeolian', 'aeolian': 'aeolian', 'phrygian': 'phrygian'}
SOFTER = {'horn': 'strings', 'oboe': 'flute', 'lute': 'harp', 'pipe': 'recorder', 'strings': 'strings', 'flute': 'flute', 'recorder': 'flute', 'harp': 'harp'}
HUSH = {'march': 'gentle', 'tavern': 'gentle', 'folk': 'gentle', 'dark': 'dark', 'gentle': 'none', 'none': 'none'}
NIGHT = {
    'village': ('Lamplight on the Well', 'Soft lamplight and quiet faces by the well.'),
    'wild': ('The Road Under Stars', 'The road winds on softly toward shadowed hills.'),
    'eastend': ('Spring Lanes in Moonlight', 'Hedgerows drift in a hushed spring night.'),
    'whisperwood': ('Pines After Dark', 'Tall pines rustle with something distant and low.'),
    'saltmere': ('Dockside Hush', 'Salt wind over quiet docks and empty tables.'),
    'mountain': ('Frostbound Switchbacks', 'The road climbs on in silence through the frozen turns.'),
    'mt_shrine': ('Moonlit Shrine', 'The stones keep still in the high shadow.'),
    'mt_pass': ('Cold Hunt by Night', 'Eyes in the snow and the pass gone quiet.'),
    'castle': ('Royal Court by Moonlight', 'Whispers drift across the water under the banners.'),
    'lakes': ('Stone Bridge in Moonlight', 'Still water holds the moon; the bridge stands quiet.'),
    'wolfden': ("The Pack's Silent Watch", 'The high air bites while the den watches from afar.'),
    'cavemouth': ('Damp Echoes', 'The last light fades, leaving echoes off the rock.'),
    'spidercave': ('Silent Webs in the Dark', 'Too many legs shift softly in the dark.'),
    'ancientchapel': ('Old Hush on the Hill', 'Broken stone hums while the hill keeps its hush.'),
    'evengrove': ('Stillness Off the Map', 'A calm that feels wrong, kept off every chart.'),
    'ziibiing': ('Birch River Moon', 'Canoes rest on calm water; voices low by the fire.'),
    'lodges': ('Embers of the Elder Tale', 'Logs settle to embers while the old stories go on.'),
    'ricelake': ('Paddles in the Dark Rice', 'Quiet paddles among the rice under the stars.'),
    'sugarcamp': ('Kettles Under the Stars', 'Woodsmoke curls while the kettles hiss into the night.'),
    'flintbank': ('Sparks in the Night Breeze', 'Stone on stone, soft, in the river night.'),
    'obsidianbank': ('Black Glass, Cold Tide', 'Dark reflections shimmer on the black glass shore.'),
    'willowbank': ('Willows Over Dark Water', 'Willows bow over the slow, dark water.'),
    'dragonapproach': ("Squire's Vigil", 'A lonely watch under the wide night sky.'),
    'dragonkeep': ('Ashes of the Ember King', 'Ash settles on broken iron and the heavy chain.'),
}


def compose(area, name, mood, lead, bpm, mode, meter, perc, pad, bstyle, night=False):
    if night:   # the same seed below keeps the tune; everything about how it is played softens
        name, mood = NIGHT[area]; mode, lead, perc, bstyle, pad = DARKER[mode], SOFTER[lead], HUSH[perc], 'drone', True
        bpm = max(54, round(bpm * 0.75))
    R = random.Random(int(hashlib.sha256(area.encode()).hexdigest()[:12], 16))
    sc, root = MODES[mode], R.choice(ROOTS)
    bar = meter * 4
    deg = lambda d: root + 12 * (d // 7) + sc[d % 7]                    # scale degree -> midi
    chord = lambda c: [c, c + 2, c + 4]                                  # a triad on degree c
    progA, progB = R.sample(PROGS[mode], 2)
    progB = progB[1:] + progB[:1]
    harm = progA + progA + progB + progB                                 # 16 bars of A A' B B'
    # the motif: two bars of rhythm and pitch (scale degrees relative to the chord root)
    def make_motif():
        out = []
        for b in range(2):
            cell, t = R.choice(CELLS[meter]), 0
            cur = R.choice([0, 2, 4]) if b == 0 else out[-1][1]
            for i, ln in enumerate(cell):
                if t > 0:
                    r = R.random()
                    cur += R.choice([-1, 1]) if r < 0.6 else (R.choice([-3, -2, 2, 3]) if r < 0.85 else 0)
                    cur = max(-3, min(7, cur))
                    if t % 4 == 0 and R.random() < 0.6: cur = min([0, 2, 4, 7], key=lambda x: abs(x - cur))   # strong beats lean on chord tones
                out.append((b * bar + t, cur, ln)); t += ln
        return out
    motifs = [make_motif(), make_motif()]                                # A's idea and B's idea
    leadN = []
    for sec in range(4):                                                 # form A A B A, 8 bars each
        bars = harm[:8] if sec != 2 else harm[8:]
        mo = motifs[0] if sec != 2 else motifs[1]
        for ph in range(4):                                              # four two-bar phrases
            c = bars[ph * 2]
            notes = [list(n) for n in mo]
            if ph % 2 == 1:                                              # the answer: the motif's tail reshaped
                for n in notes[len(notes) // 2:]: n[1] += R.choice([-1, 0, 1])
            if ph == 3:                                                  # the cadence: end long on the tonic (or the fifth mid-piece)
                notes[-1][1] = (0 if sec in (1, 3) else 4) - c
            for (t, d, ln) in notes:
                start = sec * 8 * bar + ph * 2 * bar + t
                m = deg(c + d)
                while m > 81: m -= 12
                while m < 57: m += 12
                vel = (0.75 if t % bar == 0 else (0.6 if t % 4 == 0 else 0.5)) * (0.85 if night else 1)
                leadN.append([start, ln, m, round(vel, 2)])
    bassN, padN = [], []
    for sec in range(4):
        bars = harm[:8] if sec != 2 else harm[8:]
        for bi, c in enumerate(bars):
            s0 = (sec * 8 + bi) * bar
            r = deg(c) - 24 if deg(c) - 24 >= 36 else deg(c) - 12
            fifth = r + 7
            if bstyle == 'drone': bassN.append([s0, bar, r, 0.6])
            elif bstyle == 'pulse': bassN += [[s0 + k, 2, r if k % 4 == 0 else fifth if k % 8 == 4 else r, 0.55] for k in range(0, bar, 2)]
            else:                                                        # walk: root, a passing tone, the fifth, an approach
                if meter == 4: bassN += [[s0, 4, r, 0.65], [s0 + 4, 4, r + (sc[2] - sc[0]), 0.5], [s0 + 8, 4, fifth, 0.55], [s0 + 12, 4, fifth + 2 if fifth + 2 < 60 else r, 0.45]]
                else: bassN += [[s0, 4, r, 0.65], [s0 + 4, 4, fifth, 0.5], [s0 + 8, 4, r + 12 if r + 12 < 60 else r, 0.45]]
            if pad:
                for d in chord(c):
                    m = deg(d) - 12
                    padN.append([s0, bar, m, 0.32])
    return {'id': area + ('_night' if night else ''), 'name': name, 'mood': mood, 'lead': lead, 'bpm': bpm, 'meter': meter, 'mode': mode, 'bars': 32,
            'night': night, 'base': area,
            'parts': {'lead': leadN, 'bass': bassN, 'pad': padN}, 'perc': PERC[perc][meter]}


tracks = {}
for t in TRACKS:
    tracks[t[0]] = compose(*t)
    tracks[t[0] + '_night'] = compose(*t, night=True)
areas = {t[0]: t[0] for t in TRACKS if t[0] not in ('wild', 'lakes', 'mountain')}
areas.update({'mt_lodge': 'mountain', 'mt_warden': 'mountain', 'mt_farside': 'mountain', 'mt_ledge': 'mt_shrine', 'mt_crags': 'mt_pass'})   # the camps (tools/mountain/make_camps.js)
data = {'tracks': tracks, 'order': [k for t in TRACKS for k in (t[0], t[0] + '_night')], 'areas': areas, 'wild': 'wild', 'start': ['village', 'wild'],
        'regions': [{'track': 'lakes', 'x0': -330, 'y0': 330, 'x1': 230, 'y1': 560, 'note': 'the Lake Castle\'s lakes and river (tools/castle/make_waters.js)'},
                    {'track': 'mountain', 'x0': -640, 'y0': 590, 'x1': -150, 'y1': 1060, 'note': 'the great mountain (tools/mountain/make_mountain.js)'}]}
mod = {'ashvale3d': 'module', 'name': 'music', 'api': 1, 'v': 1, 'data': data}
with open(os.path.join(ROOT, 'data', 'music.json'), 'w') as f:
    json.dump(mod, f, separators=(',', ':'))
n = sum(len(t['parts']['lead']) + len(t['parts']['bass']) + len(t['parts']['pad']) for t in tracks.values())
print('music: %d tracks, %d notes, %d KB' % (len(tracks), n, os.path.getsize(os.path.join(ROOT, 'data', 'music.json')) // 1024))

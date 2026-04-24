# Late for the Bus — Plan

## Concept

Granny is late for the 87 bus. Alternate Left/Right (or A/D) as fast as possible for 100m. If she's not at the stop in 12s, the bus leaves. Double-press, same-key repeat, or simultaneous-press → she falls over and loses 600ms. Most people fail their first few runs. Share your time-to-spare.

## Mechanic

- Impulse model. Each valid alternating tap adds `impulsePerTap = 0.7 m/s` to velocity. Velocity decays each frame by `drag = 0.85`. Cap at `maxVelocity = 12 m/s`.
- Fault rules (all one code path → `fall()`): same-key repeat, double-press, or opposite key within `simultaneousWindowMs = 40`. Fall sets velocity → 0, stuns 600ms, shows "OOPS!".
- Only edge-trigger on keydown (`event.repeat` ignored). Keys already held at GO ignored until released.
- Cap at `maxRegisteredCps = 20` — extra taps silently dropped, kills autoclickers.

## Win / Lose

- Fixed 100m, 12s timer.
- Cross finish in time → "CAUGHT with Xs spare."
- T=0 before finish → bus pulls away to horizon, "MISSED."

## Visuals — fake-3D receding road (Canvas 2D)

- Dark asphalt + dashed yellow centre stripes scrolling at velocity.
- Pavement strips, procedural coloured buildings parallax-sliding, lamp-posts at intervals for speed cue.
- Dawn-sky gradient (pink → blue).
- Bus = red rectangle at z=100m, perspective-scaled; grows as granny approaches, retreats to horizon if timer expires.
- Granny centre-screen, drawn procedurally from Canvas shapes (v1.1; emoji 👵 placeholder in v1 MVP). Left key → left leg kicks, right key → right leg. Handbag pendulum. Stride phase advances π per tap.
- HUD: countdown timer, progress tape (granny icon → bus icon), "OOPS!" flash on fall, red screen flash 100ms.
- Faint motion-blur vignette at high velocity.

## Audio — Web Audio API, procedural, no asset files

- Tap: 40ms synth click, pitch rises with rolling CPS.
- Fall: descending sweep + noise "oof".
- Catch: chord/cheer. Miss: sad descending tones.
- Mute button top-right, `localStorage`-persisted.
- AudioContext lazy-created on first Play click (browser autoplay policy).

## Game flow

- Title screen (name + tagline + Play button + best time-to-spare if any)
- 3-2-1 countdown (inputs ignored)
- 12s run
- Result screen: freeze-frame, score, personal best flash, "Play again", clipboard Share button
- Best time-to-spare persisted in `localStorage`
- `?debug=1` URL flag → FPS, velocity, rolling CPS, distance overlay

## Tech

- 3 files: `index.html`, `style.css`, `game.js`. Zero dependencies, zero build step.
- **Local testing first.** Before any deployment, run locally (e.g. `python3 -m http.server` or just open `index.html`) so the user can play, tune, and give feedback. Only deploy once the user signs off.
- Deploy to GitHub Pages (after local sign-off).
- No autopause on blur (timer keeps ticking).
- No `prefers-reduced-motion` special-casing.
- Canvas resize → recompute via ratios, no pause.
- Target: modern evergreen browsers; Canvas 2D + Web Audio + localStorage.

## CONFIG constants (top of `game.js`)

```js
const CONFIG = {
  trackLengthM: 100,
  timerSec: 12,
  startCountdownSec: 3,

  impulsePerTapMS: 0.7,
  drag: 0.85,
  maxVelocity: 12,

  simultaneousWindowMs: 40,
  stunMs: 600,
  fallVelocityMultiplier: 0,

  maxRegisteredCps: 20,

  busStartZ: 100,
  busRetreatSpeed: 40, // m/s the bus pulls away at after timer expires
};
```

## Phased build order

1. **v1 MVP** (desktop keyboard only, emoji granny)
   - Canvas setup, game loop, input (arrows + A/D)
   - Impulse/drag physics, fault detection
   - 12s countdown, receding road + stripes, bus-at-horizon
   - Result screen, localStorage best, debug flag
2. **v1.1** — procedural Canvas granny with kicking legs + handbag swing, parallax buildings, lamp-posts, red-flash + OOPS HUD
3. **v1.2** — procedural Web Audio SFX + mute toggle
4. **v1.3** — catch/miss end animations, share-to-clipboard snippet
5. **v2** — mobile tap zones (left-half / right-half listeners, `touch-action: manipulation`)

## Resolved design decisions (interview log)

- Win condition: fixed 100m time trial
- Tap→speed: impulse model (not instantaneous CPS)
- Faults: same rule for double-press, same-key repeat, simultaneous-press → fall
- Visual style: fake-3D receding track + stylised character
- Character: late-for-bus granny
- Bus behaviour: 12s countdown, pulls away on expiry
- Platform: desktop v1, mobile v2
- Rendering: Canvas 2D
- Art: phased — emoji MVP → procedural Canvas granny
- Audio: procedural Web Audio, no assets
- Flow: title → 3-2-1 → run → result, with localStorage best + share
- Difficulty target: hard (most people fail)
- File structure: 3 files, GitHub Pages
- Input: arrows + A/D, no autopause, no reduced-motion handling
- Scene: stylised urban road

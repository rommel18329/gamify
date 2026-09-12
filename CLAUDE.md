# Sprout

A gamified habit tracker. Checking off real habits (hygiene, gym, journaling,
sleep schedule, work discipline), drinking water, and logging meals earns
in-game cash and "standing," which buys home-security upgrades and a
vehicle in a 3D world you walk around — and can drive. Missing your
property's deterrence lets random "incidents" (break-ins) succeed and cost
you cash; defending them in person (as a small raid where you tap intruders)
pays out instead.

This is a personal side project, unrelated to any CRM work — don't conflate
the two.

## Workflow

Once changes are made, tested (see below), and pushed as a PR, merge it into
`main` right away rather than waiting for separate approval — the owner has
asked for that standing. Still hold off and flag it instead if something
came back genuinely uncertain (tests didn't fully pass, a behavior call you
weren't sure was wanted) rather than merging through it.

## Running it

No build step, no dependencies. Two levels:
- **Open `index.html` directly in a browser** for the core path (the habit
  checklist, LOG/STATS/BADGES/HOURS/BACKUP) — fully functional over `file://`,
  confirmed by tapping a habit and watching cash actually move with no server
  running.
- **Serve the folder** (`python3 -m http.server`) **to get the 3D world.**
  This is new, and it's a real requirement, not a nicety like the Google Fonts
  `@import` used to be: the engine now loads as ES modules (see "The engine is
  ES modules now" below), and Chrome refuses to fetch a module script from
  `file://` — CORS blocks it outright. Opened via `file://`, ENTER THE WORLD
  never completes; opened over `http://`, everything works. Confirmed both
  ways before writing this down, not assumed.

- **Build the single file** (`node tools/build_single.js`) **to get a
  double-clickable `sprout.html`** that needs no server at all. This is the
  answer to both of the above: it inlines everything, fetches nothing, and is
  also what gets published as the shareable artifact. See "One file, no
  server, no CSP" below for the two separate things it has to survive and why
  a data:-URI build is NOT one of them.

There is no test suite. Verify changes by actually loading the page and
clicking through: ENTER the world, open LOG/STATS/the security and garage
sheets, and check the browser console for errors. A quick way to drive it
headlessly is Playwright against `/opt/pw-browsers/chromium` (see recent
git history / PR descriptions for example scripts) — screenshot after
`ENTER` and after any lighting/geometry/camera change, since those bugs are
visual and won't throw.

## File layout

```
index.html          shell: markup, a small ES-module bootstrap, then <script>
                     tags in load order — see "The engine is ES modules now"
css/styles.css       all styling
js/errors.js         window.onerror -> visible on-screen error box (loads first)
js/vendor/three.module.js     three.js 0.169, ES module, vendored verbatim, MIT
js/vendor/three-vrm.module.js @pixiv/three-vrm 2.1.3, ES module, MIT — VRM
                     (VRoid) character loading, see "VRM characters"
js/vendor/jsm/       GLTFLoader/OBJLoader/MTLLoader/SkeletonUtils/
                     BufferGeometryUtils, all ES modules, vendored verbatim
                     from three.js 0.169's own examples/jsm/
js/vendor/cannon.js  cannon.js (the original, not cannon-es), vendored
                     verbatim, MIT licensed — drives the car, see "Car physics"
js/data.js           state, save/load, economy, habits/vitals math (no DOM/THREE)
js/badges.js         procedural achievement badge art on canvas (no THREE) —
                     loads before ui.js, on the core path, see "Achievements"
js/carphysics.js     from-scratch car physics engine (no THREE, no DOM) — the
                     fallback if vendor/cannon.js fails to load, see "Car physics"
js/models.js         loads the CC0 rigged characters + car, recolours them into
                     outfits, drives their animation mixers; also VRM loading,
                     see "VRM characters"
assets/              CC0 rigged characters (characters/*.glb); there is no
                     vehicle model — the car is procedural, see "The car";
                     assets/characters/vrm/ holds the one bundled VRM preset
js/game.js           the 3D scene: world building (one function per structure —
                     buildHouse/buildGarage/buildColmado/etc., all called from
                     buildWorld()), character/car/prop meshes, camera, input,
                     movement (walk + drive), the render loop
js/ui.js             DOM glue: renders sheets (LOG/STATS/SECURITY/GARAGE/BACKUP/
                     CHARACTER) from state in data.js, wires up onclick handlers
manifest.json, icon.svg   PWA install metadata
```

Load order in `index.html` matters, and it now has two layers. `errors.js`,
`data.js`, `badges.js` and `ui.js` are still plain classic scripts, loaded
first, completely unchanged in shape — they render the core path before any
of the engine below has even started fetching. A small `<script
type="module">` bootstrap comes next: it builds a real, mutable `window.THREE`
(an imported module's namespace object is frozen and can't take new
properties like `THREE.GLTFLoader` — this is `Object.assign({}, ...)` into a
fresh object, not the module namespace itself), sets `THREE.ColorManagement.
enabled = false` (see below), and then **dynamically injects** the remaining
classic scripts — `cannon.js`, `carphysics.js`, `models.js`, `game.js` — each
with `.async = false` so they still fetch in parallel but execute in the same
strict order they always did. `game.js`/`models.js`/`carphysics.js` are
**unchanged in shape**: still classic scripts, still reading a global `THREE`
the same way they always did — only the bootstrap that builds that global is
new. The one real consequence: because the bootstrap is inherently async,
`game.js`-level globals (`enterWorld`, `AVE_Z1`, anything else game.js
defines) are no longer guaranteed to exist the instant the core path renders,
the way a fully synchronous classic-script chain guaranteed it. `enterWorldSafe()`
in `ui.js` already existed for exactly this gap for the real ENTER button; any
new code (or test) that needs a game.js global before that point needs the
same `typeof window.enterWorld==='function'` wait — three of this project's
own Playwright test scripts hit this and needed the same fix when the engine
was upgraded, see `scratchpad/core_path.js`/`regress.js`/`badges_test.js`.

## The engine is ES modules now

This is the one deliberate exception to "classic scripts, no build step" in
this codebase, and it exists for exactly one reason: **VRM (VRoid) character
support.** Modern three.js (>= 0.163) ships **no classic/UMD build at all** —
only ES modules, confirmed by checking jsdelivr directly (`three@0.160` still
serves `build/three.min.js`; `three@0.163` and every version since returns
404 for it, and classic `examples/js/` loaders were already gone even at
0.160). `@pixiv/three-vrm` — the only actively maintained VRM loader for
three.js — requires three >= 0.164.1. There is no version of either that
keeps both "real VRM support" and "plain `<script>` tags, openable via
`file://`" true at once. Two real paths existed and were weighed:

- **A legacy path**: pin three.js to the last UMD-shipping version (~0.160)
  and pair it with three-vrm's own last UMD release (0.6.11, the old VRM0-only
  API, requiring three ^0.137.4) — keeps classic scripts and `file://`
  entirely, but locks the whole engine ~9 years behind current and gets the
  unmaintained, VRM0-only loader API.
- **The path taken**: move to modern three.js (0.169) + three-vrm 2.1.3 as ES
  modules, with the module-bootstrap bridge described above keeping
  `game.js`/`models.js`/`carphysics.js`/`ui.js`/`data.js` as classic scripts
  regardless. `file://` loses the 3D world (see "Running it"); everything
  else about the app's shape is preserved.

Two things were measured, not assumed, before committing to this — both are
real behavior changes an upgrade like this can silently introduce, and both
are exactly the kind of thing this project's rendering conventions already
warn about getting wrong:

- **Colour management.** Modern three.js turns on a real sRGB-aware lighting
  pipeline BY DEFAULT (`THREE.ColorManagement.enabled = true`) — every hex
  colour and every light intensity in this codebase was tuned against r128,
  which never did this. Rendering this game's own `buildLighting()` numbers
  (0.42 ambient + 0.46 sun + 0.19 fill) on the ground colour `0x6E7A62`
  through both engines and reading back the actual pixel:
  ```
  r128                                     -> [114,128,105]
  0.169, ColorManagement ON  (the default) -> [ 63, 71, 57]   ~45% darker
  0.169, ColorManagement OFF               -> [105,111,101]   within ~8%
  ```
  Left on, the whole game renders visibly muddier at every light level — the
  OPPOSITE failure mode from the documented white-clip risk, but just as
  real. The bootstrap sets `THREE.ColorManagement.enabled = false` and
  `renderer.outputColorSpace = THREE.SRGBColorSpace` (the measured-closest
  match to the old look) for exactly this reason — if you ever see the game
  looking uniformly darker or duller than it should, check this hasn't been
  reverted before looking anywhere else.
- **The white-clip threshold moved — in the safe direction.** Swept the same
  ground plane's light intensity from 0.5x to 3x in both engines: r128 clips
  to solid white at 2.5x; 0.169 (ColorManagement off) is still only
  `[175,184,168]` at 3x. The new engine's tone response is more compressed,
  so "light intensities must not sum past ~1.0" (see the rendering
  conventions below) has MORE headroom now than it used to, not less — but
  re-verify with the same method (sample a real pixel, don't eyeball it) if
  you ever retune the lighting rig again, rather than assuming either
  engine's number still applies.

**`preserveDrawingBuffer: true` on the `WebGLRenderer`** is new, and it's not
a leftover default — it's load-bearing for this project's own QA method.
Without it, under headless Chromium + SwiftShader (`scratchpad/*.js`'s own
test harness), a frame renders correctly every single time — real draw
calls, real triangle counts, an immediate synchronous `render()` +
`readPixels()` call shows real content — but a SEPARATELY issued
`page.screenshot()` or `gl.readPixels()` call reads back solid `[0,0,0,0]`
on every pixel, canvas included. Confirmed as a genuine r128 -> 0.169 change
under this exact harness, not a pre-existing flake: the identical test
against the old engine, same flags, same everything, screenshots correctly
every time. A real player's browser composites each frame live and never
hits this gap — but this project's whole verification method is "screenshot
after ENTER and after any lighting/geometry/camera change," and a build that
passes every check yet screenshots blank is worse than one that fails
loudly. Don't remove this flag to chase a theoretical performance gain
without re-confirming screenshots still work without it first.

## One file, no server, no CSP (`tools/build_single.js`)

`node tools/build_single.js` writes `sprout.html` — the entire game as one
self-contained file. It is what gets published as the shareable artifact, and
it is the only way to open the 3D world without running a server. Two
*separate* restrictions shaped it, and a build that handles only one of them
looks fine locally and is broken for the player:

- **`file://` refuses module scripts.** Chrome blocks them by CORS (origin
  `null`) with no fallback. Measured: opened via `file://`, all six engine
  modules fail, `window.THREE` stays undefined, and every ENTER tap answered
  "STILL LOADING — ONE SECOND" forever. `enterWorldSafe()` now names this case
  explicitly instead of implying a wait that will never end.
- **The artifact host's CSP refuses `data:` in script position.** This is the
  one that mattered most and the one that is easy to get wrong, because it
  does not reproduce locally: a `data:` URI in an **import map** works
  perfectly over `file://` (no CSP there), so a data:-URI build passes every
  local test and is still dead the moment it is published. Measured behind a
  realistic policy: `Refused to load the script 'data:text/javascript;base64,…'`
  for every module, `window.THREE` undefined, ENTER hangs — the identical
  symptom as the `file://` case, from a completely different cause. **An
  import map cannot point at an inline `<script>`**, so there is no way to
  keep ES modules and satisfy this at once.

So the build **fetches nothing at all**, by two mechanisms:

- `tools/esm_to_classic.js` rewrites each engine ES module into a strict-mode
  IIFE (`import {A} from 'three'` → `const {A} = __THREE_NS__`, `export {…}` →
  the IIFE's return value) and they are concatenated into ONE plain inline
  `<script>`. It is a deliberately dumb transform, safe only because every
  vendored module has the same tidy shape (verified before it was written: no
  `import.meta`, no `export default`, no dynamic import, imports only at the
  top). It **throws** on anything it cannot account for rather than emitting a
  subtly wrong bundle. If you vendor a new module, check that shape first.
  `'use strict'` inside each IIFE is not tidiness — ES modules are implicitly
  strict and a bare function body is not.
- Models are handed to `GLTFLoader.parse()` / `OBJLoader.parse()` as raw
  base64 decoded in-page, **not** as `data:` URIs. A `data:` URI still goes
  through the loader's `FileLoader`, which is an XHR — governed by CSP's
  `connect-src`, a *different* directive from the one above. Measured: with
  `connect-src 'self'`, every model came back "Refused to connect to
  `data:model/gltf-binary…`", the game silently fell through to the
  `makePerson()`/`makeCar()` primitives, and the good characters and car were
  simply gone with no visible error. `parse()` removes the network step, so no
  policy can reach it.

Verify a change to this build the way it was verified the first time: serve
the output behind a CSP **tighter** than the real one (`script-src` without
`data:`, `connect-src 'self'`) and confirm `THREE.REVISION`, `enterWorld`,
`VRMLoaderPlugin`, `ASSETS.chars` (both rigs) and `ASSETS.car` are all really
there — not just that the page rendered. Falling back to primitives throws no
error and looks like success.

The core path keeps its own separate, early `<script>` in this build too. An
earlier draft put all eight files in one blob behind the engine, which made
the habit checklist wait on ~5 MB of three.js — the exact thing "the default
screen must never load the 3D world" exists to prevent, reintroduced by the
build script rather than the app.

Known gap in the artifact build only: the BACKUP SAVE sheet's export is a
plain download link, and the artifact viewer never grants pages download
permission, so it does nothing there. It works normally in the served app and
in a local `sprout.html`.

## State (`S` in `js/data.js`)

`S` carries a `playerId` (a uuid generated once and never changed) and a
`schemaVersion`. Nothing reads them yet — they exist because this world goes
multiplayer later, and an anonymous save can't be attributed to a character,
merged, or synced. `migrate()` backfills a `playerId` onto saves that predate
it. **Keep `S` strictly JSON-serialisable** — no THREE objects, no functions,
no class instances — or it stops being syncable and `exportSave()` breaks.
Bump `SCHEMA_VERSION` only for a shape change `migrate()` can't reconcile by
adding keys; additive changes don't need one.

`S` is one big object, persisted to `localStorage` under key `sprout_v2`
via `save()`. `blank()` is the source of truth for its shape; `migrate()`
fills in any missing keys from `blank()` so old saves don't break when a
field is added. If you remove a field from `blank()`, you don't need to
migrate anything away — `migrate()` only adds, and stale keys in an old
save are simply ignored.

Habits are window-scoped — see **The core path** below before changing
`HABITS`, `toggleHabit()`, or anything that reads `S.log`.

`HABITS` (checkbox list) and `VITALS` (the HUD meters, each driven by one
or more habits, or by `workout`/`diet`) are the two lists that define what
the player tracks. If you add a vital, make sure something actually writes
to whatever `src` it reads — `NUTRITION` sat permanently empty for a while
because `vitalLevel()` read `S.diet` but nothing ever pushed to it; the fix
was `logMeal()` in `js/data.js` + a row in `openLog()` in `js/ui.js`. Don't
add a `PAY` entry or a vital `src` without also adding the UI path that
triggers it — half-wired vitals/economy entries are dead code players can
never see move, which reads as broken.

`NUTRITION` and `HYDRATION` are counter-based dailies (a target number of
meals/cups per day, not a single checkbox) sharing one `logCounter(field,
target, payKind, el)` helper in `js/data.js` — add a third the same way
rather than copy-pasting. `HABITS.every(...)` (the "did everything today"
check, used by both `habitStreak()` and `checkPerfectDay()`) has to be
paired with the water-target check by hand, since water used to be one of
`HABITS` itself before it became a counter and isn't anymore.

Money and "standing" only ever move through `earn()` — it applies the
streak multiplier, XP, and level-ups in one place. Don't add cash/standing
anywhere else. `unearn()` is its exact mirror for undoing an accidental log
(tapping a checked habit/workout again, or the UNDO button on a counter
row) — it recomputes the same `PAY[kind]*mult()` rather than storing what
was actually paid out, which is only exact if nothing else changes between
logging and undoing it. That's fine for the "I tapped by mistake, fix it
right now" case this exists for; it is not a general ledger.

`S.perfectDone[today]` exists purely to stop the perfect-day bonus from
being farmed: `unearn()` deliberately does *not* claw back a bonus that
already paid out (undoing one habit after a perfect day shouldn't erase the
day), which means without a flag, toggling a habit off and back on after
completing a perfect day would trigger `checkPerfectDay()` again and pay
the +140 a second time. Any new way to "uncomplete" a day's requirement
needs to keep going through `checkPerfectDay()`, not reimplement the
every-habit-plus-water check inline, or it'll bypass this guard.

## The core path (windows, and the two-session loop)

**The default screen is the habit list, and it must never load the 3D world.**
Opening a WebGL scene to tick a checkbox is the friction that kills habit
apps, so `#title` is now the core path — open, see this window's habits, tap
them, get paid, done — and the world is one tap away but never required.
Measured cold-start: **123 ms to interactive, whole morning window logged in
6.6 s across 9 taps, zero WebGL contexts created.** If a change pushes any of
that up, it has broken the point of the screen.

Two load-order facts keep that number, and both are easy to undo by accident:

- **`errors.js`, `data.js` and `ui.js` load BEFORE Three.js and cannon.js**,
  and `bootHome()` renders immediately rather than waiting for
  `DOMContentLoaded` (which also waits for those ~1 MB of engine). Nothing on
  the core path touches `THREE`. `enterWorldSafe()` covers the sliver of time
  where ENTER exists but `game.js` hasn't parsed.
- **The webfont is a non-blocking `<link>` in `index.html`, NOT an `@import`
  in `styles.css`.** A stylesheet with a pending `@import` blocks execution of
  every script after it — a slow or unreachable `fonts.googleapis.com` held
  the entire app, habit list included, for as long as the request took to time
  out. Measured: 12,973 ms → 123 ms from moving it. Never put a remote
  `@import` back in the stylesheet.

### Windows

`S.windows` holds `{am:{start,end}, pm:{start,end}}` as fractional local hours,
**user-configurable** (`openWindowSettings()`) because the owner does not keep
normal hours — a hardcoded window makes the loop unusable. A window whose end
is at or before its start wraps past midnight; the night window does by
default (18:00 → 03:00).

**The day boundary is the morning window's start, not midnight** —
`sessionDay()`. Logging "in bed on time" at 1am is last night's habit. One
rule, and it makes a wrapping night window behave the way a person expects.
Everything that records or reads "what happened today" uses `sessionDay()`,
not `today()`; `today(d)` remains the pure date formatter.

Habits carry `window: 'am' | 'pm' | 'both'`. A `'both'` habit is stored once
per window under `habitKey()` (`teeth:am`), while single-window habits keep
their bare id — so **saves written before windows existed still read**, and
`habitDone()` treats a legacy `true` as satisfying either window. Keep that
shim; deleting it silently zeroes historical streaks.

- `canLogNow()` is the gate. **There is no retroactive logging** — a closed
  window is closed, which is what makes the appointment real.
- `claimWindow()` pays the completion bonus once per window per day, guarded
  by `S.claims`. A second claim and an out-of-window claim both return false.
- **ONLY EARNING IS GATED.** Walking, driving, browsing and buying stay
  available during the lull. Locking someone out of the world is punishment,
  not anticipation — don't add a gate that does it.

### Pay on the tap

`earn()` fires inside `toggleHabit()`, immediately, per tap. **Never batch a
window's earnings into a collect step**: the delay between action and reward
is the thing being optimised, and immediate rewards are what make a behaviour
automatic fastest. `habitChime()` (in `game.js`, since it uses the audio
graph) climbs a major scale with how far into the window you are and resolves
on the last habit, so finishing sounds like finishing — deliberately varied
because a flat repeated blip becomes wallpaper within a week.

### bindTap(), and why it isn't onclick

`bindTap()` in `ui.js` binds `pointerup`, `touchend`, `mouseup` AND `click`,
collapsing them with a 350 ms dedupe. That looks like belt-and-braces and
isn't: **one finger press produces a different event set on different
engines** — measured here, a tap produced `pointerdown, touchstart,
mousedown, mouseup` with no `pointerup` and no `click` at all, so rows bound
to `onclick` did nothing while a scripted `.click()` worked fine. Binding a
single event silently breaks taps on some engine. Because there's no `click`
to lean on, scroll-vs-tap is told apart by hand: a pointer that travels more
than 10 px is a scroll and logs nothing.

Related: **`touch-action` on `html,body` is `manipulation`, not `none`.** A
blanket `none` (it was there for the 3D drag) stops click synthesis and stops
a habit list taller than the screen from scrolling. `#game`/`#cv` set their
own.

### Cues

Every habit ships an `anchor` — a routine cue in words ("right after I
brush"), rewritable by the player into `S.anchors`. Routine-based cues build
automaticity better than clock times, which is why none of them are blank.

## The progression economy

**Six parallel tracks**, `TRACKS` in `js/data.js`: SEGURIDAD, LA CASA, EL
CARRO, EL DRIP, EL BARRIO, and MAESTRÍA (which is bought with habits, not
money — see Automaticity below). Prices are staggered **across** tracks, not within
one — DRIP is the cheap track (120–7,000), CASA and BARRIO the middle,
SEGURIDAD spans everything, CARRO is the long haul. One linear ladder always
produces a wall you stare at for a week; five never do, because something
cheap is always pending on another track while you save.

Measured at a fresh save: **37 things buyable, 💵120 to 💵18,000, 15 of them
under 500** (MAESTRÍA's seven sit behind habit gates on top of that). If pacing runs dry, **add upgrades — never inflate the habit
payout**, which devalues everything already bought.

SEGURIDAD and CARRO wrap the pre-existing `SEC` / `VEH` / `MODS` ladders
rather than replacing them, so the deterrence mechanic and the garage don't
regress. `trackEntries(key)` normalises all five into one shape; `CASA`,
`DRIP` and `BARRIO` are plain data whose `f`/`lv` fields set `S.<track>.<f>`,
which is what lets step 4 hang a mesh off every purchase.

### A floor, not a cadence

`nextGoal()` returns the cheapest unowned thing across every track at today's
price — **that is the floor, and it is guaranteed**. What is deliberately NOT
guaranteed is *when* it lands: a reward you can predict produces no prediction
error and therefore no response, and steady predictable reinforcement
measurably flattens out. Do not add an "affordable every N days" schedule.

Uncertainty comes from three places, none of which touch the base habit
payout — **random core pay reads as unfair and destroys trust in the loop**:

- `rollScratch()`, the colmado scratch after each completed window. Mostly
  small, ~15% a real hit. Paid **flat**, no streak multiplier: it's a windfall,
  not earned effort, and multiplying it would make a long streak swing the
  variance wildly.
- `todaysDeal()` discounts one item per session day, picked from what you
  **can't yet afford**, so it moves something into reach rather than
  discounting what you were buying anyway. Rolled once and stored, or it would
  reshuffle on every render.
- Incident losses, already in the game.

**The shown price and the charged price must come from the same place.**
`priceOf()` applies the deal, and `buySec`/`buyVeh`/`buyMod` take a `price`
argument so it actually applies at the till — they briefly didn't, which made
the discount a lie on two of five tracks and spun a purchase loop forever.
They also return true/false now so a caller can tell a refusal from a success.

Simulated over 120 days at 100/80/60% compliance: the floor never once
empties, and time-to-next-unlock stays genuinely spread — 8–11 distinct gap
lengths, mean 2.3–3.2 days, ranging same-day to 12 days. Re-run
`econ_sim.js` after any price change.

### Streaks and the freeze

`mult()` is `1 + streak/STREAK_TO_DOUBLE` capped at **2.0x at 30 days**. The
cap is load-bearing: an uncapped multiplier outruns every price in the
catalogue and collapses the floor into "everything at once".
`streakWorth()` shows what the streak is worth **in cash per day** rather than
as a day count. `habitStreakFor(id)` tracks each habit separately.

**The freeze is earned, never bought** — one per 10 perfect days
(`grantFreezeIfDue()`), hold at most 3, applied automatically. It exists
because harsher streak punishment makes people quit permanently rather than
try harder; a missed day must never destroy forty days of work.

`rollDay()` is the **only** thing that spends a freeze, so `habitStreak()`
stays a pure read safe to call every render. It walks from `S.lastRoll`
**inclusive** — starting a day later skipped the one day most likely to need
covering, so freezes piled up to the cap while the streak broke anyway. A
covered day is recorded in `S.covered[k]` and `habitStreak()` treats it as
complete. Verified in simulation: at 80% compliance a 116-day streak survives
across 10 covered days; at 60% it correctly does not.

## Automaticity, the fade, and the handoff

This is what the app is actually for. Everything above it — streaks, cash,
five upgrade tracks — is scaffolding around the one number in `js/data.js`
that measures whether a behaviour still needs the game.

### The curve is the published one

`automaticity(h)` is `1 - e^(-k·n)` with `k = 3/66`, so `A(66) = 0.95` —
the median from Lally et al. (2010), whose individual range was 18 to 254
days. `n` is **repetitions, not calendar days**, which is the part most habit
apps get wrong. Two consequences, both from the same paper, both load-bearing:

- **A missed day is not a reset.** Lally found a single missed opportunity had
  no measurable effect on the trajectory. A miss costs `AUTO_MISS` (half a
  rep) and the score floors at zero. Anything harsher would be inventing
  psychology to make a mechanic feel dramatic.
- **A day a freeze covered is neutral.** It protects the streak, which is a
  social fact; it cannot make a behaviour automatic, because you didn't do it.

`AUTO_MASTER` is **0.95, not a rounder number**. An earlier draft used 0.80,
which sounds reasonable and lands at 35 reps — barely half the evidence.
Measured at 100% compliance it also finished all 27 habits by day 107; at 0.95
the same run masters at days 65 / 131 / 197, one tier at a time. If mastery
ever starts arriving in weeks, that threshold is wrong again.

The score is **settled once per day inside `rollDay()`'s existing walk**
(`settleAuto(k)`), so each day counts exactly once ever, and read **live**
with today's rep included, so the bar moves on the tap rather than tomorrow.

### The fade, and where the money goes

`habitPayScale(h)` is `1 - AUTO_FADE·A`. Paying for something you'd now do
anyway is the overjustification effect: it replaces your own reason for doing
it, and then withdrawing the payment leaves you worse off than never paying.
So the payout decays along the curve — 💵12 new, 💵3 at the top. It fades to a
**floor, not zero**; zero reads as a punishment for succeeding.

`earn(kind, el, amount, scale)` takes the scale as a fourth argument so the
fade reaches the single money path rather than becoming a second one.
`unearn()` mirrors it. **`toggleHabit()` reads the scale ONCE, before it
touches the log** — computing it after the mutation gives the log branch and
the undo branch different numbers (the undo one always larger), and tapping a
habit on and off paid out the difference every time. That was a live exploit.

The money taken off does not vanish: `masteryBonus()` is
`1 + 0.12·masteryCount()` on the **window bonus and the perfect day** — paid
for turning up, not for any one named act. A controlling reward becoming an
informational one, which is the direction SDT says to move in. Simulated over
200 days, daily income *rises* as habits stick (421 → 785 at full compliance).

`habitFrame(h)` returns the band, the label and the mode (`'pay'` /
`'identity'`) as data, so the row, the sheet and the tests read one source. The
copy has to switch with the payout or the fade just reads as the game quietly
paying you less.

### The handoff — and why nothing may shrink

Crossing `AUTO_MASTER` does four things and only the first takes anything away:
the habit **retires from the list**, it is recorded permanently in
`S.mastered`, its **successor unlocks** (a harder version at zero automaticity,
paying full rate again), and `masteryBonus()` plus one more `MAESTRIA` gate
open for good.

A successor **replaces** its parent rather than sitting beside it. Once
brushing your teeth is automatic, ticking a box for it is theatre; asking for
two timed minutes is the same behaviour escalated. It also keeps the daily list
at ~9 items instead of growing to 27, and it is why habit income *recovers* on
every handoff instead of collapsing.

**Both the retirement and the unlock take effect TOMORROW** (`nextDay()`).
Today already has a roster and a perfect-day requirement; changing either
mid-day could break the day you succeeded on, which is the one thing this
design must never do. For the same reason **history is judged by the roster the
day actually had** — `habitActiveOn(h,k)` / `habitsOn(k)`, keyed on
`S.unlocked` / `S.retired`. A habit with no `after` needs no unlock record, so
old saves need no migration. `dayComplete()`, `habitStreak()` and
`checkPerfectDay()` all go through these; using bare `HABITS` in any of them
retroactively breaks streaks on the day a successor unlocks.

`contentInventory()` counts what is **REACHABLE**, not the catalogue. Counting
a shut gate from day one makes an unlock register as nothing, which is exactly
what this inventory exists to detect — it did, in the first draft. Gates only
ever open, so `open` can only rise: measured 106 → 131 across 200 days. Buying
consumes content (that is what buying is for); **mastering never does**, while
the habit tree still has depth. Mastering the third tier of a line ends that
line and is reported honestly rather than asserted away. Re-run
`scratchpad/handoff.js` after touching any of this.

### MAESTRÍA

The sixth track, gated on habits rather than money — `TRACKS.maestria`,
prices 2,400–40,000, where the freed economy goes. **Two gates**, because they
run out at different times: `m` counts mastered habits and opens the early
items; `L` counts completed lines (a habit taken through all three tiers) and
opens the late ones, so the track doesn't go quiet exactly when the hardest
work starts. `maestriaLock(it)` is the single source — the sheet, the till and
`contentInventory()` cannot disagree about a gate. **A gated item renders
locked with what it needs, never hidden**: a thing you can see and can't have
yet is content; a thing you can't see is nothing. `buyableEntries()` (not
`allNextEntries()`) feeds `nextGoal()` and `todaysDeal()`, or the progress bar
would point at something a purchase can't complete.

All seven are real geometry, each in its own group tagged `userData.mst` —
which is what lets `scratchpad/probe_maestria.js` ask where a purchase landed
and whether it overlaps anything, instead of a human guessing camera angles.
It found two real clashes (banderitas threaded through the pérgola's slats, the
fountain clipping its corner). Related: **stop `requestAnimationFrame` before
setting a camera for a screenshot** — `tick()` lerps the camera back toward its
own ideal every frame, so a shot taken 300 ms after positioning photographs the
default angle. Three shots came out that way before this was noticed.

### Copy

All reward copy is **informational** — what a thing is and what it changes
about the place — never "do X to get Y". Controlling framing crowds out the
intrinsic motivation this whole app depends on; describing a consequence does
not. Keep new copy on that side of the line.

## Backup

`localStorage` is the *only* copy of a save — there's no server. `exportSave()`/
`importSave()` in `data.js` and the BACKUP SAVE sheet in `ui.js` exist so a
player can get a copy out. Don't remove that path; if you change `S`'s shape,
`importSave()`'s call to `migrate()` should keep old backups loadable.

Every mutation site already calls `save()` itself right after changing `S`
(that's the actual persistence — keep doing this for anything new), but
`data.js` also calls `save()` on `visibilitychange`/`pagehide` as a backstop
in case a future change ever forgets to, since a mobile browser can
background or kill the tab at any point. If progress ever doesn't survive
a session, check for a spot that mutates `S` without calling `save()`
before assuming the backstop itself is broken.

## Models (`js/models.js`, `assets/`)

People are real rigged models: Quaternius "Ultimate Modular Men" (**CC0 1.0**,
verified from the pack's own `License.txt` — no attribution required). The
hand-built `makePerson()` primitives are still there as a **fallback**: every
call site is `modelPerson(...)||makePerson(...)`, and `loadAssets()` always
fires its callback even when a download fails, so a broken asset costs you the
good characters — never a black screen or a hung loading screen. Don't remove
that fallback path.

**The car is not a download at all** — see "The car" below. `loadAssets()` no
longer fetches a vehicle, so `modelCar()` finds no `ASSETS.car` and the
`modelCar()||makeCar()` call site falls through to the procedural one every
time. `modelCar()` is kept intact and working: drop a vehicle `.obj` back into
`loadAssets()` and it takes over again with no other change (it would also
need a `parse()` substitution in `tools/build_single.js`, like the characters
have — a `data:` URI is refused by `connect-src`).

Three things bite here, all of them already fixed once:

- **Clone with `THREE.SkeletonUtils.clone()`, never `.clone()`.** A plain clone
  shares the skeleton, so every NPC would animate in lockstep.
- **Cloned models SHARE geometry with the cached source in `ASSETS`.** That's
  why `modelPerson()`/`modelCar()` tag their subtrees `userData.sharedGeo` and
  `backToTitle()` skips disposing flagged geometry — disposing it gutted the
  cache and the *second* ENTER rendered nothing. Materials are per-instance
  clones (that's what makes recolouring one person not repaint everybody), so
  those are still disposed. Also note a mesh's `.material` can be an **array**
  on loaded models, which has no `.dispose()` of its own.
- **Every mixer must be ticked every frame**, standing characters included —
  `updateAnimated(dt)` in `tick()` does this. A mixer that never updates leaves
  its model frozen in the bind pose (a T-pose), which reads as a hard crash.

Outfits come from `FITS` in `js/models.js`, keyed by each model's own material
names (`Skin`, `Hair`, `Purple`, …). Material names differ per model and
unknown keys are ignored, so one colour swap turns a couple of downloads into a
whole block of different-looking people.

### VRM characters

A real VRoid/VRM character is a **third layer**, above the
`modelPerson()||makePerson()` pair, not a replacement for either — the
PLAYER's character only. `buildPlayer()` builds the normal placeholder
(exactly as before, synchronously) and THEN calls `loadPlayerBody()`, which
is entirely optional and entirely async: if `S.person.character` names a VRM
(`{type:'preset',id:'avatarA'}` or `{type:'custom'}`), it loads in the
background and swaps the model in on success; on failure, on a slow
connection, or with `type:'default'`, the placeholder that was ALREADY on
screen just stays there. Never a blocked ENTER, never a broken world — same
"a bad asset costs you the good character, never a black screen" rule
`modelPerson()||makePerson()` already lives by.

**Where a character comes from:**
- `VRM_PRESETS` in `js/models.js` — one bundled file,
  `assets/characters/vrm/AvatarSample_A.vrm` (pixiv's own official VRoid
  Studio sample; the licence permits alteration and distribution but is
  **not CC0** — it also excludes for-profit corporations, which is fine for
  this personal project and is exactly why UPLOAD, not more presets, is the
  intended path: a VRM is ~15MB, roughly 10x every other character asset in
  this repo combined, and that cost is only worth paying for a character
  that's actually yours).
- **Upload your own** — make one free at **vroid.com** (VRoid Studio),
  export the `.vrm`, pick it in the CHARACTER sheet (`openCharacter()` in
  `ui.js`). Read via `FileReader` as an `ArrayBuffer` and stored in
  **IndexedDB** (`saveCustomVRM()`/`loadCustomVRM()` in `js/models.js`),
  deliberately NOT in `S`: a VRM is nowhere near `localStorage`'s realistic
  quota (5-10MB, shared with the actual save), and `S` must "stay strictly
  JSON-serialisable" (see State above) — `S.person.character` only ever
  holds the small marker `{type:'custom'}`, never the bytes.

**Character selection happens from the TITLE screen** (`openCharacter()`,
reached the same way `openTracks()`/`openBadges()` are), deliberately not
from inside the 3D world — a change takes effect on the NEXT `enterWorld()`,
so there is no live in-world swap to build. `openCharacter()` itself has to
tolerate being tapped before `models.js` has loaded (the core path is
usable before the engine finishes, on purpose — see "The engine is ES
modules now"): it checks `typeof VRM_PRESETS!=='undefined'` and shows "still
loading" for the preset rows rather than throwing, the same class of guard
`enterWorldSafe()` already used for ENTER itself.

#### Borrowing a walk cycle (`makeVRMRetargeter`)

A VRoid export ships a skeleton and **no animation whatsoever**. The
Quaternius GLBs already in `assets/` carry **24 clips** on a full humanoid
rig. `makeVRMRetargeter()` in `js/models.js` maps one onto the other, so a
VRM character walks with the same animation as everything else in the world
— no new asset, no authoring, and all 24 clips come along free because a
**pose** is copied rather than a clip converted.

An invisible Quaternius rig (the "puppet") is driven by an ordinary
`THREE.AnimationMixer` playing the real clip; its bone pose is copied onto
the VRM's *normalized* humanoid bones, and `vrm.update()` then copies those
onto the skinned skeleton. **Order matters**: retarget first, `vrm.update()`
second — `updateVRM()` does this — or the mesh renders a frame stale and, on
the first frame, in its bind pose.

Three things were measured, and each one on its own left the character
silently T-posed with no error anywhere:

- **The two rigs rest in different poses.** Measured: Quaternius rests with
  arms hanging down (**156°** off vertical), VRoid rests in a true T-pose
  (**92°**). Plain delta retargeting — take the source's rotation relative to
  its own rest, apply it to the target — *preserves the target's rest pose by
  construction*, so the VRM kept its T-pose with a small walk swing added on
  top. The fix is the per-bone `align`: swing each target bone's rest
  direction onto the source's first, so the target adopts the source's pose
  instead of decorating its own.
- **Bone direction cannot come from "the first child that `isBone`".**
  three-vrm builds its normalized rig from plain `Object3D` nodes, **not**
  `THREE.Bone`, so that test found nothing on the target side and every
  alignment quietly fell back to identity. `VRM_BONE_CHILD` names the chain
  explicitly so both rigs answer the same question the same way.
- **Both rigs must be read in ONE coordinate frame.** Source-in-world against
  target-relative-to-`vrm.scene` puts the alignment half a turn out, because
  `vrm.scene` carries `rotateVRM0()`'s rotation. The puppet is pinned to the
  VRM's own world transform every frame — which also makes the retarget
  indifferent to which way the character is facing, since both rigs turn
  together.

Also note the **multiply order** in `C = S_rest⁻¹ · align · T_rest`.
Premultiplying gives a conjugation instead, which leaves the target sitting
in its own rest pose — measured at 104°, still essentially the T-pose, and it
looks like "almost working" rather than like a bug.

Verified by measurement, not by eye: the VRM's shoulder-to-hand angle tracks
the puppet's to within a fraction of a degree, and the left foot swings
through a **1.77-unit stride** across the cycle (1.75 through the real game
path). If retargeting is unavailable — the GLBs failed to download, so there
is no rig to borrow from — `makeVRMRetargeter()` returns `null` and
`stepVRM()` falls back to its forward lean rather than throwing.

#### The wardrobe

VRoid names every material by role — `_SKIN`, `_CLOTH`, `_HAIR`, `_FACE`,
`_EYE`, with the CLOTH ones additionally saying Tops / Bottoms / Shoes. That
is VRoid's own export convention, **not a guess**, which is what lets
`vrmSlotOf()` work on any `.vrm` the player exports rather than only on the
bundled sample. Confirmed against that sample first: its Body mesh really
does carry Tops, Bottoms and Shoes as separate primitives, and hair is its
own mesh.

Two operations, very different in cost:

- **Show/hide** a slot (`vrmSetSlot`) is free and works on a single file.
- **Wear a garment from a different `.vrm`** (`vrmWear`) is the actual
  wardrobe. The donor mesh's `skinIndex` values index the **donor's** bone
  array and mean nothing against another skeleton, so they are remapped **by
  bone name**. Trusting the two arrays to share an order would work for two
  exports of the same base body and fail silently on any other pair — the
  kind of bug that shows up as one sleeve inside-out rather than as an error.
  Measured on a real pair: **103 of 103 bones remapped, zero unmatched**, and
  a vertex high on the garment moves with the body once the character walks.

**`Box3.setFromObject` cannot verify any of this** — it transforms the
geometry's *bind-pose* bounds by the world matrix, so a skinned mesh
deforming in place reports an identical box every frame. It reported "no
movement" on a transplant that was working perfectly. Measure a real vertex
through `applyBoneTransform` instead.

**What this deliberately does NOT do is change a garment's SHAPE.** VRoid
bakes the cut into the mesh, so an oversized tee and a fitted one are two
different exports — there is no slider. Different silhouettes come from more
`.vrm` files, not from code, and `DRIP_FITS` cannot produce them.

#### EL DRIP: the fit catalogue

`DRIP_FITS` in `js/data.js` — colourways per slot in **three tiers**, because
the interesting question is not "can you afford it" but "how did you get it":
`free` ships with the character, `cash` is the ordinary DRIP ladder, and
**`earned` cannot be bought at any price** (gated on mastered habits, completed
lines, or a best-ever streak). Verified: with 💵999,999 in hand an `earned`
entry still refuses.

`fitLock(f)` is the single source of truth for availability — the sheet and
the till cannot disagree about a gate, the same rule `maestriaLock()` follows.
A locked entry renders **dimmed and still tappable**, never hidden: a thing
you can see and can't have yet is content. The streak gate reads
`S.stats.bestStreak` (best ever), never the current streak — earned drip is
never clawed back, same reasoning as the freeze.

`S.person.character.fit` is `{hide:{slot:1}, tint:{slot:0xRRGGBB}}` — flags
and numbers only, since `S` must stay JSON-serialisable. It is a **separate
key from `character`** on purpose: the fit survives swapping bodies, which is
what a wardrobe means. `applyVRMFit()` is called from `loadPlayerBody()`'s
swap (alongside `dripAccessories()`), not from `loadVRM()`, because that is
the moment the character becomes the player's; it skips slots the model
doesn't have, since a fit saved against one `.vrm` gets applied to another
all the time.

**A tint MULTIPLIES.** Measured: every VRoid garment material is
texture-driven with a neutral white colour factor, so the colour lives in the
painted image. A tint can darken and shift hue; it **cannot brighten**. Dark
hair goes black or deep blue, never platinum, and a "white tee" entry simply
would not work — which is why every value in the table sits on the dark side.
Same rule as `detailMap()`'s "textures are multiply maps only", arriving from
the other direction.

Four more things bite here, all found by measuring rather than assumed:

- **VRM 0.x faces -Z.** Every other character and the car in this world
  faces +Z (see "All three car representations face +Z" under Car physics).
  VRM 1.0 fixed this to the usual +Z convention, but VRM 0.x (what VRoid
  Studio and most existing VRM files actually export) still faces -Z —
  found by rendering a VRM straight-on and photographing the back of the
  head. `three-vrm`'s own `VRMUtils.rotateVRM0(vrm)` is the fix, called only
  when `vrm.meta.metaVersion==='0'`.
- **A VRM's face is literally invisible without `vrm.update(dt)` every
  frame**, not just posed wrong. three-vrm drives the mesh's actual (raw)
  skinned skeleton from a separate, always-clean "normalized" rest rig, and
  `.update()` is what copies that pose across — skip it and
  `getNormalizedBoneNode()` still reports a perfect T-pose while the MESH
  itself sits wherever the loader left the raw skeleton, which one time
  produced a character with an arm stretched clean across the screen despite
  every bone position measuring completely normal. `updateVRM(dt)` in
  `tick()` (a registry parallel to `updateAnimated(dt)`'s `ANIMATED` mixers,
  not folded into it — a `THREE.AnimationMixer` and a VRM instance both
  expose `.update(dt)` but do entirely different things with it) covers this
  for every loaded VRM, every frame, moving or standing — same reasoning as
  the mixer-ticking rule right above this section.
- **DRIP accessories have to be re-applied after the swap, not just once in
  `buildPlayer()`.** `dripAccessories()` runs on the placeholder BEFORE the
  VRM finishes loading; without calling it again on `vrm.scene` inside the
  swap, switching to a VRM character would silently drop every hat/glasses/
  chain purchase — exactly the failure "a failed model download must never
  cost you an upgrade you paid for" already rules out for the GLB fallback,
  just arriving through a different door (a *successful* swap, not a failed
  one).
- **`stepVRM()` never returns false.** It picks walk/idle for the retargeter
  (see "Borrowing a walk cycle" above) and returns `true` unconditionally,
  which matters for a reason beyond animation quality: `stepAnim()` returning
  `false` falls through to `tick()`'s primitive-limb branch
  (`ud.legL.rotation.x=...`), which reaches for `userData` fields only
  `makePerson()` ever sets and would throw on any VRM character. Keep that
  true even in the fallback path where no source rig was available.

### The car

A **1996–2000 Civic EK three-door hatchback**, built from primitives in
`makeCar()`. Shape only — no badge, no maker's mark, no model lettering
anywhere on it, for exactly the reason the colmado signage is generic: a
silhouette is not a trademark, a logo is.

**The body is ONE EXTRUDED SIDE PROFILE, not an assembly of boxes.** The first
attempt built the screen, roof and hatch as separate rotated slabs and they
rendered as loose panels hovering over a flatbed — there was no continuous
surface anywhere, because there wasn't one. A car's identity lives in an
unbroken side outline (cowl → screen rake → roof → hatch fall), so the outline
is defined once as a `THREE.Shape` and swept across the width with
`ExtrudeGeometry`. Two consequences worth knowing:

- `ExtrudeGeometry` builds in local XY and sweeps along local +Z, so the mesh
  is rotated `-Math.PI/2` about Y to put the profile nose-to-tail along world
  Z and the sweep across world X. Nose stays along **+Z** like every other
  representation of this car (the cannon.js chassis `Box`, the collider), so
  there is still no rotation offset anywhere — see what a stray one cost under
  Car physics.
- **The wheel arches are part of the profile**, not stuck on. The bottom edge
  of the outline lifts over each wheel. An earlier version drew them as black
  boxes on the flank and the car looked like it was hovering above four loose
  tyres.
- **Glass panes ride the same vertices the profile uses.** They were left on
  pre-arch coordinates once and the hatch glass sat a third of its own length
  short of the glass line.

The proportions are the real car's, not taste: 4.18 m long, 1.70 wide, 1.36
tall on a 2.62 m wheelbase — against this world's fixed 4-unit person that is
2.4 : 0.97 : 0.78 with the wheelbase at 1.5× person height. `CAR_LENGTH`
(9.6) already sits on that 2.4× figure, which is why the profile is laid out
at 4.7 and scaled once at the end. `CAR_LENGTH` remains the single source of
truth. The tail falls steeply to a near-vertical panel: a gradual taper there
reads as a notchback saloon, which is the wrong car entirely.

`carExtras()` still runs on it, so every garage mod (wheels, tint, tune,
spoiler, underglow, plate) remains visible exactly as before.

## Environment geometry

Everything in the world is procedural — there is no downloaded environment
asset. A few pieces are worth knowing because each replaced something that
read badly for a specific, diagnosable reason:

- **Palms** (`buildPalms`) are coconut palms: a leaning trunk of stacked
  segments each tipping a little further over, ring scars at the joints, an
  arcing frond crown and a coconut cluster. The lean matters — a vertical palm
  reads as a lamp post with leaves on. Fronds come from `frondArc()`, a chain
  of flattened tapering segments each rotated further down, so the blade arcs.
  The old fronds were **round cones fanned off a single point**, which reads
  as a bottle brush from every angle; flat-and-drooping is the entire
  difference between a palm and a spike.
- **Trees** (`buildFoliage`) mix three species across the block — spreading,
  branched, and the flamboyán (flat umbrella canopy, red bloom) that is
  everywhere in Santo Domingo. Twenty copies of one shape read as wallpaper;
  the eye catches repetition long before it catches polygon count. The old
  tree stacked three same-size blobs in a vertical column, which read as
  broccoli.
- **Streetlights** (`buildStreetLights`) are leaning wood poles with a
  crossarm, insulators, a bracket lamp and drop lines. The old version was a
  bare tapered post with **no lamp head at all** — the light came entirely
  from separate glowing spheres strung between posts, so the post itself read
  as a fence stake. The strung bulb line is kept: it is what actually lights
  the domino table at night.
- **Placeholder buildings** (`buildPlaceholders`) mix three fronts —
  punched openings, a Dominican street front (roll shutter, awning, barred
  upper windows, rooftop tinaco, rebar stubs), and stepped masses with a stair
  tower. They deliberately speak the same vocabulary `buildHouse()`/
  `buildColmado()` already use, so they belong to the street rather than
  looking imported.
- **`livedIn(parent, opts)`** hangs the stuff that says people live here on a
  building — split AC unit, electricity meter and its service drop, a laundry
  line with washing on it, potted plants. It takes a parent and plot-LOCAL
  coordinates, **never `S` and never a plot record**, so a neighbour's house
  gets the same treatment from the same call (see the PLOTS rules).
- **Fence** tier 2+ sets broken bottle glass into the capping course — the
  cheap deterrent on half the walls in the barrio, and the one detail that
  says what the wall is *for*.
- **Street signs** carry a drop shadow on the lettering, a bracket, bolts and
  a PARE plate below. A solid backer plate was tried behind the lettering and
  removed: it rendered over the text and both signs came out blank.

All the small repeated pieces here (fronds, shards, wires, bars, ribs) pass
`{ink:false}` — an outline on each of a few dozen adjacent slivers reads as
noise and doubles the mesh count for nothing.

**Cost, measured:** this roughly doubled the scene, 1,298 → 2,762 meshes, for
104 → 159 draw calls and 7.4k → 12.3k triangles. Under headless SwiftShader
(CPU rendering, not representative of a phone GPU) that moved frame time
46.9 ms → 54.5 ms, ~14% for 2.1× the meshes. If that budget ever gets tight,
the cheap dials are the palm count and frond segments, the `livedIn()` laundry
line, and the streetlight drop-line bundle — in that order.

## Rendering conventions (anime/toon look)

Everything is built from primitives (`M()` in `js/game.js` wraps a THREE
geometry in a `MeshToonMaterial` and adds a dark backface "ink" outline
mesh). Key rules baked in from past bugs — don't undo them without a good
reason:

- **No custom GLSL, ever.** A hand-written shader that fails to compile
  doesn't throw a JS error (three.js just logs a warning and draws
  nothing), which previously produced a silent black screen with nothing
  in the on-screen error box to explain it. Stock `MeshToonMaterial` +
  the 4-band gradient map in `toonGradientMap()` is the entire "shader."
- **Light intensities must not sum past ~1.0 on a top-lit face.**
  `MeshToonMaterial` sums each light's own step-shaded contribution
  independently, so ambient + sun + fill together used to add up to ~2x
  on any upward-facing surface (ground, driveways, car roofs, roofs in
  general — anything with a normal pointing toward the sun/fill), clipping
  the color to solid white. That's why the whole ground plane and every
  driveway used to render pure white regardless of their actual color. If
  you add another light or brighten an existing one, sanity-check a
  horizontal surface's rendered color isn't clipping (sample a ground
  pixel — it should read close to its source hex, not 255,255,255).
- **No offscreen post-processing pass.** Same failure mode as custom
  shaders — render straight to the canvas.
- Player/NPC figures are built by `makePerson()`: capsule limbs via
  `limb()`, a lathe-profile torso via `torsoGeo()`, sphere head/hands/feet.
  Eyes' catchlight is a child of the eye mesh itself so it can't visually
  separate from the eye or show through the head.
- New world objects go through `M()` so they automatically get the toon
  material + ink outline; only reach for a bare `THREE.MeshBasicMaterial`
  for small unshaded accents (headlight glow, an LED, a catchlight) the
  way the existing code does.
- **Textures are multiply maps only.** `detailMap(kind, repeatX, repeatY)`
  in `js/game.js` returns a `CanvasTexture` painted at runtime (so it costs
  nothing to download) that is *white with the detail painted in as darker
  pixels*. The surface's actual tint always comes from `M()`'s color
  argument, never baked into the image. That's deliberate: a map that can
  only darken cannot push a face into the white-clip described above, so
  adding a texture never changes a surface's light-sum profile. If you
  ever bake a base color into a canvas instead, re-check a top-lit face
  isn't clipping. The canvases and the per-repeat textures are cached
  forever (like `TOON_GRADIENT`) — `backToTitle()`'s material disposal
  doesn't touch textures, so the cache stays valid across ENTER trips.
  `concreteCanvas()`'s grime band lives in the *bottom* rows, which is v=0
  once three.js flips Y, so walls using it are mapped with a Y repeat of 1
  and must not be tiled vertically or the grime shows up mid-wall.

### Dominican building parts

The house, the garage and the colmado are all assembled from three shared
helpers in `js/game.js` rather than each rolling its own: `rejas()` (the
ornate barred windows/gates), `zincRoof()` (corrugated roofing), and
`roofKit()` (rooftop tinaco plus the rebar stubs of a second floor that
never got built). Two things baked in from looking at the renders:

- `zincRoof()`'s ribs are **real geometry straddling the panel**, not just
  the texture, and not sitting on top of it. A mapped flat slab reads as a
  grey plank from any distance; ribs only on the upper face leave the
  underside flat, and the porch awning is at head height so its underside
  is what you actually look at most of the game.
- `roofKit()`'s column stubs have to clear the roof parapet or the whole
  detail is invisible from ground level.

Small repeated pieces (bars, diamonds, ribs, sign lettering) pass
`{ink:false}` — an outline on each of a few dozen adjacent slivers reads as
noise and doubles the mesh count for nothing. These builders together add
roughly 200 meshes to the scene; if that budget gets tight, rib spacing and
the rejas `spacing` argument are the cheap dials, and the house's rear
windows already skip their rejas for this reason.

Colmado signage is **deliberately generic**. Real colmados are covered in
beer and phone-company branding, but shipping actual trademarks would be
brand impersonation — the sign uses the same colours and layout with no
real logo. Keep it that way.

## Camera

Third-person, orbit-drag controlled (`camYaw`/`camPitch`, fixed
`camDist=9.5`), always looking at whichever transform is under control (the
player, or the car in drive mode — see below) and converging toward its
ideal position with a `lerp`. It has **no collision** — it can end up
inside nearby geometry if the player stands close enough to a building
and looks toward it. The player's spawn point (`playerGroup.position` in
`buildPlayer()`) was chosen specifically to keep the *default* camera clear
of the colmado building (it used to converge to a resting spot several
units inside it, rendering as a wall of solid color filling the screen —
the classic "camera clipped through geometry" bug, and the first thing
every player saw). If you move the spawn point, the world layout, or
`camDist`/default `camPitch`, re-check that the converged camera position
(`player.pos + camDist*cos(pitch)` roughly, in the direction opposite
`camYaw`) doesn't land inside a building.

`cameraMode` (`'orbit'` default, or `'first'` — toggled by the HUD button,
`toggleCameraMode()`) reuses the same `camYaw`/`camPitch` drag state for both
modes, but they mean different things in each: in orbit mode they place the
camera *behind* the target; in first-person they're remapped into the
camera's own look direction *from* the target's eyes (`lookPitch` in `tick()`
deliberately inverts `camPitch`'s sense — dragging up should look up, but
`camPitch` itself decreases on an upward drag). `updatePlayerVisibility()`
is the one place that decides whether `playerGroup` is shown — hidden in
first-person (you'd otherwise be staring at the inside of your own head) or
while driving, visible otherwise — call it after changing either
`controlMode` or `cameraMode` rather than setting `.visible` directly, or
the two can leave it in a stale state (e.g. toggling camera mode back to
orbit while still driving must NOT reveal the player). `cameraMode` is a
deliberate preference, not session state — it persists across a
MENU→ENTER round trip on purpose, so `backToTitle()` resets `controlMode`
but not this.

`camDist` (default `9.5`) is adjustable at runtime via the `#zoomSlider` HUD
control (`setZoom()`) for a wider, more pulled-back third-person framing —
it's meaningless in first-person, so `syncCameraModeUI()` hides the slider
whenever `cameraMode==='first'` alongside flipping the HUD button label;
add anything else that only makes sense in one camera mode to that same
function rather than scattering `cameraMode` checks around.

## Movement & driving

`tick()` in `js/game.js` runs one of two branches depending on `controlMode`
(`'walk'` or `'drive'`). Walking still uses the original small shared
helpers — `seekTarget(pos, target, speed, dt)` (move a position directly
toward a point, returns whether it arrived/is moving and the heading to
face) and `smoothYaw(current, target, rate, dt)` (turn toward a heading at
a given rate) — a person can strafe/turn independently of their facing
without looking wrong. **Only walking is tap-to-move**; driving is pedals
(see Driving controls below), so in drive mode `handleTap()` returns
immediately and a tap does nothing at all. `enterDriveMode()`/
`exitDriveMode()` (also `js/game.js`) hide/show `playerGroup`, toggle the
`#exitVehicleBtn` and `#driveHud` HUD elements, add/remove `#game`'s
`driving` class, and call `clearDriveInput()`. `backToTitle()` resets
`controlMode` back to `'walk'` — don't remove that, or leaving to the title
screen mid-drive would carry the mode into the next session with the player
mesh still hidden.

### Driving controls (pedals, not taps)

The car is driven with on-screen **GAS / BRAKE / ‹ / ›** buttons
(`#driveHud` in `index.html`, styling under "driving controls" in
`css/styles.css`, bound by `bindDriveHud()` in `js/game.js`), modelled on
mobile driving games like Car Parking Multiplayer. This is the primary
scheme — the game is played on a phone, so **any control that only exists
on a keyboard doesn't exist**. WASD/arrows are a desktop convenience that
writes into the same place.

That "same place" is `driveInput` (`{gas, brake, left, right}`): pedals and
keyboard both write it, and both `driveCarCannon()` and `driveCarFallback()`
only ever read it. Adding a third input source (a gamepad, tilt) means
writing `driveInput` too — never reading raw events inside the physics.
`gas`/`brake` are `0..1` rather than booleans so an analog source can feed
them without touching the physics.

Things that will bite if changed:

- **`brake` is one pedal doing two jobs**: it brakes while the car is rolling
  forward and becomes reverse once forward speed drops below
  `CAR_CREEP_SPEED`. That decision needs *signed* speed along the car's own
  heading (`velocity · heading`), not `|velocity|`, which can't tell forward
  from backward. Both physics paths compute this the same way.
- **Pointer events, not `click`/`touchstart`** — driving means holding gas
  *and* a steer button at once, and only pointer events give each finger its
  own `pointerId`. `bindDriveHud()` calls `setPointerCapture()` on press so a
  finger sliding off a button mid-corner still delivers its release to that
  button; without it the pedal sticks down.
- **`touch-action:none` / `user-select:none` on `.pedal` are load-bearing**,
  not tidiness. Without them a held button triggers scroll/zoom gestures and
  the iOS long-press callout, both of which swallow the `pointerup` and leave
  the car flooring it. `clearDriveInput()` on `blur`/`visibilitychange` covers
  the same failure when the tab is backgrounded mid-press.
- The pedals are siblings of the canvas, not children, so pressing one never
  reaches the canvas tap/drag handlers. Keep it that way rather than adding
  propagation guards.
- `syncPedalUI()` is the only thing that sets `.held`, so keyboard driving
  lights the same buttons a finger would. Set `driveInput` through
  `setDriveKey()`/`bindDriveHud()`/`clearDriveInput()` rather than assigning
  fields directly, or the buttons desync from the actual input.
- `#driveHud` overlaps where `#zoomWrap` normally sits; `#game.driving`
  lifts the zoom slider clear of the pedals. Anything else added to the
  bottom corners needs the same treatment.

The car itself is a backdrop-adjacent object, not inside the garage: see
`CAR_SPOT`/`buildGarage()`'s comment in `js/game.js` for why (the garage is
a solid, unopened box — parking the car at the same coordinates hid it
completely). `rebuildCar()` in `js/ui.js` (called after a paint/mod
purchase) preserves the car's *current* position/rotation rather than
resetting to `CAR_SPOT`, since the car may not be parked there anymore
once it's driveable.

### Car physics

Driving does **not** reuse `seekTarget()` — that helper moves a position
straight toward a point regardless of facing, which for a car reads as
crabbing sideways into its own turns, since a vehicle can only actually move
along its own heading.

The handling constants at the top of `js/game.js` (`CAR_TOP_SPEED`,
`CAR_MAX_ENGINE_FORCE`, `CAR_BRAKE_FORCE`, `CAR_STEER_LOW`/`_HIGH`/`_RATE`,
`CAR_ANGULAR_DAMPING`) are **measured, not picked** — see the isolated-Node
method below. Three of them exist because of specific ways driving felt
broken:

- **`CAR_TOP_SPEED` is enforced by tapering engine force**
  (`taper = 1 - frac²`, `frac = speed/CAR_TOP_SPEED`), not by clamping
  velocity — a hard clamp fights the contact solver and reads as hitting an
  invisible wall. There is no drag in this world, so without the taper
  holding gas accelerates forever (measured: still climbing past 21 u/s
  after 6 seconds).
- **Max steering lock falls off with speed** (`CAR_STEER_LOW` at a
  standstill toward `CAR_STEER_HIGH` at top speed). Full lock is what you
  want for parking and what spins you out at speed.
- **`carSteer` ramps toward the target at `CAR_STEER_RATE`** rather than
  snapping to it (and self-centers 1.6x faster than it turns in, like a real
  rack). `setSteeringValue()` with the full lock every frame was half of why
  steering felt awful.

**`js/vendor/cannon.js` drives the car** — a real rigid-body chassis on 4
raycast wheels with actual suspension (`CANNON.RaycastVehicle`), not a
hand-rolled model. This is the original `cannon.js` (schteppe), not the
actively-maintained `cannon-es` fork — deliberately: `cannon-es` only ships
ESM/CJS builds now, no UMD/global, and this app is classic `<script>` tags
with no build step on purpose (see File layout above); loading an ES module
here would mean either a bundler or breaking the load-order model every
other script relies on. The original still ships a proper UMD build
(`f.CANNON=e()` in a plain global branch) with the *identical*
`RaycastVehicle` API — `cannon-es` forked it to modernize the codebase, not
the physics — so it fits this architecture with zero compromise on the
actual driving feel. MIT licensed either way.

`buildPhysicsWorld()` builds one static box body per `buildingColliders()`
entry (see Collision below) plus a ground plane; `buildVehicle()` builds the
chassis and 4 wheels, sized off `CAR_LENGTH`/`CAR_WIDTH` so they can never
drift from the visual mesh. `driveCarCannon()` in `js/game.js` turns
`driveInput`'s pedals into `engineForce`/`steer`/`brake`, steps the world,
and copies the settled chassis transform onto `world.car`. `js/carphysics.js` (below) is the fallback if
`window.CANNON` is ever undefined (`USE_CANNON`, decided once at load) —
same "a missing asset costs you the good version, never a broken game"
pattern `models.js` uses for characters — so anything that touches driving
needs a code path for both.

**Four real bugs, all found by simulating in isolated Node before ever
touching the browser** (`node -e "eval(require('fs').readFileSync('js/vendor/cannon.js','utf8'))..."`,
building a `CANNON.World()` + `RaycastVehicle` exactly like `buildVehicle()`
does and logging `chassisBody.position`/`.velocity` over simulated time —
do this again before retuning any of the constants below):

- **This cannon.js version defaults its vehicle-frame axis indices wrong for
  a Y-up world.** `indexRightAxis`/`indexForwardAxis`/`indexUpAxis` default
  to `(1,0,2)` — a different convention than this game's Y-up, Z-forward
  world. `buildVehicle()` passes `{indexRightAxis:0,indexUpAxis:1,indexForwardAxis:2}`
  explicitly; without it, engine force still shows up on the wheel and
  `isInContact` still reads true, but the propulsive impulse comes out
  along world X instead of the chassis's actual forward direction — the car
  just slides sideways under full throttle. This one is easy to
  mis-diagnose: removing it once looked like it fixed a bug (the car
  launching sideways on spawn) because it happened to coincide with fixing
  the CAR_SPOT/garage overlap below — always change one thing at a time
  when two suspects are in play.
- **`CAR_SPOT` needs real clearance from the garage now.** The old collision
  system only ever checked a small `CAR_RADIUS` circle around the car's
  *center point* — it never modeled the car's actual 9.6-unit length, so a
  spot whose circle cleared the garage was "safe" even with the car's rear
  end well past that circle. cannon.js's chassis is a real box that length;
  at the old `z=4` its rear end penetrated the garage's static collider,
  and the contact solver correcting that spawn-time interpenetration in
  `buildVehicle()`'s settle loop looked exactly like the car launching
  sideways over a dozen units. `CAR_SPOT` is `(9,0,7)` now — rear bumper at
  `7-4.8=2.2`, clear of the garage's `maxZ=0.5` with margin. If you move any
  parked vehicle spawn, check its full length against `buildingColliders()`,
  not just its center point.
- **`CANNON.Body` defaults `allowSleep` to `true`.** A parked car sitting
  still for even a few seconds goes to sleep, and `applyEngineForce()` on a
  sleeping body is a silent no-op — found by simulating: engine force and
  wheel contact both read correctly every frame, the car just sat dead
  under full throttle after idling. `buildVehicle()` sets
  `chassisBody.allowSleep=false` — a drivable vehicle should always respond
  the instant the player touches the controls, however long it's been
  parked.
- **Don't use `world.step()`'s 3-argument "recommended" accumulator form
  here.** With `dt` already clamped near 1/60 in `tick()`, the fixed step
  and elapsed time land on nearly the same value every frame, and
  `World.prototype.step()`'s internal-steps calculation
  (`Math.floor((time+dt)/fixedStep) - Math.floor(time/fixedStep)`) is a
  floating-point hair away from computing 0 steps far more often than it
  should. Same symptom as the sleep bug — force and contact both read right,
  nothing moves — for a completely different reason. `driveCarCannon()`
  calls the plain single-argument `physWorld.step(dt)` instead (one real
  step of that size, no accumulator), matching what the isolated tuning
  script used throughout.

**All three car representations face +Z**, and there is deliberately no
rotation offset anywhere. The game's forward at yaw 0 is `(sin y, cos y)` =
+Z; the cannon.js chassis is a `Box` of `CAR_LENGTH/2` along z; the loaded
OBJ's own `Headlights` material sits at z=+1.99 and `TailLights` at z=-1.88;
and `makeCar()` builds its body, cab, wheelbase and headlights along z to
match. A `CAR_ROT_OFFSET` of `PI/2` used to sit on `world.car.rotation.y`
and turned the mesh a quarter-turn off its direction of travel — the car
visibly drove sideways, "the side of the car is the front". One global
offset could never have been right anyway, since `makeCar()` was built
nose-along-+X while the loaded model was +Z, so the two needed *different*
offsets. If you swap the car model, measure which way it faces (grep its
`.obj`/`.mtl` for the headlight material and check the sign of those
vertices' z) and rebuild it to +Z rather than adding an offset back.
Fixing this also caught a latent bug in `makeCar()`'s fallback wheels: a
`TorusGeometry`'s hole axis is +Z and a `CylinderGeometry`'s is +Y, so the
tyre and its rim need *different* rotations to point the same way — they
were perpendicular to each other before.

`CAR_LENGTH` (`js/game.js`) is still the one source of truth for the car's
size — `modelCar()` (`js/models.js`), the primitive fallback `makeCar()`,
*and* the cannon.js chassis in `buildVehicle()` all scale to it, and
`CAR_RADIUS` (fallback-mode collision only, see below) is derived from it
too. It was previously hardcoded to `4.7`, barely 1.2x the fixed 4-unit
player height — a car you could nearly look level with. It's `9.6` now
(2.4x), landing in a believable real-car-vs-a-person range; if you ever
retune it, sanity-check the ratio the same way rather than picking a
number that merely "looks OK" from one angle.

## Collision

`buildingColliders()` in `js/game.js` lists one axis-aligned box per
building (house, garage, colmado — the colmado's box is padded further on
its street-facing side than its actual wall, to also block the counter/
crates/gas-cylinder clutter sitting in front of it) built from the same
numbers `buildHouse()`/`buildGarage()`/`buildColmado()` use, plus
`COLMADO_POS`, so the two can't drift apart independently. It's the single
source of truth for both collision systems in the game:

- `buildPhysicsWorld()` turns each entry into a real static `CANNON.Box`
  body (extruded well above head height) for the driven car, under
  cannon.js, to collide with as an actual rigid-body contact.
- `resolveCollisions(pos, radius)` pushes a position out of whichever box
  it's penetrated, along whichever axis needs the smaller correction, and
  reports whether it did — a 2D-only shortcut good enough for the walking
  player (`PLAYER_RADIUS`, called every frame from `tick()`) and for the
  car whenever `USE_CANNON` is false (`CAR_RADIUS`, called from
  `driveCarFallback()`); a hit cancels the pending `moveTarget`/
  `moveTarget` (and, for the fallback car, zeroes `carPhys.v`/`.vrot`)
  rather than leaving the seek logic pushing into the wall every frame,
  which would otherwise jitter the position back and forth against it.

Porch columns, awnings and the domino table are deliberately NOT collidable
in either system — thin single posts, not walls, and colliding with every
one of them would make walking near the house feel like fighting the
geometry.

## Streets

`buildStreets()` in `js/game.js` builds two named, gray-paved streets —
`AV. INDEPENDENCIA` (the main through avenue, extended much further in z
so there's real room to drive) and `C. MARGINAL` (crossing it between the
house and the colmado) — loosely modeled on a real Santo Domingo
intersection the owner shared, with a legible sign at each. This is a
stylized approximation, not a traced map: real street angles/curves are
collapsed onto the existing north-south/east-west grid rather than modeled
as diagonals, since a rotated road would need its own rotated collision
box, UV-rotated texture handling, and road-following logic nothing else in
the world has. `AVE_X` no longer doubles as the garage/`CAR_SPOT` x (see
`PLOTS` below) — the avenue is now a through street the car drives *to*,
not one the garage parks directly on.

`streetSign()` builds each sign as **two single-sided plates back to
back**, not one plate with a `DoubleSide` material — a `DoubleSide`
material mirrors the same texture onto its back face, which read as
reversed, unreadable text to traffic approaching from the other direction
the first time this was built. If you add another sign, copy that pattern
rather than reaching for `DoubleSide` on a textured plane.

### PLOTS — the world is data, not constants

`PLOTS` (`js/game.js`) is the list of player compounds. `PLOTS[0]` is the
owner's: `{id, ownerId, originX, originZ, rotation, upgrades}`. A second
entry, `vecino`, is a neighbour rendered by the *identical* builders from a
different record — it exists to prove the code path works, so **don't delete
it** without replacing it with something that exercises the same thing.

This replaced `HOME_X`/`CAR_SPOT`, module constants that every builder read as
globals. That was fine with one compound in the world and impossible with two,
which is where this is going (friends and family each get a plot). Two rules
keep it possible and both are easy to break by accident:

1. **A builder takes a plot and reads `plot.upgrades`. It must never read `S`
   for anything it draws.** `S` is the local player's save; rendering someone
   else's house has to be the same code path with a different record.
   `homePlotUpgrades()` is the single adapter that copies the save into
   `PLOTS[0].upgrades`, called once from `buildWorld()`. If you find yourself
   reaching for `S.security` inside a builder, that's the bug.
2. **Positions inside a compound are plot-LOCAL.** Static compound geometry
   (house, garage, security props) is parented to the plot's group via
   `buildPlot()`, so it inherits origin and rotation for free. Anything that
   moves or is interacted with in world space — the car, the board, the
   player's spawn, `spots()` — uses `plotToWorld(plot, lx, lz)` instead. The
   car in particular must **not** be parented to the plot: it drives away.

Local coordinates are the historical ones with the old `HOME_X` subtracted
from x, so `PLOTS[0]` at `originX:-16, originZ:0` reproduces the previous
world exactly. That was verified against the pre-refactor build rather than
assumed — house group at `(-16,0,-2)`, garage at `(-5,0,-3.5)`, car spawn
`(-5,0,7)`, player spawn `(-14,0,6)`, and the house/garage world bounding
boxes identical to three decimals. If you change any local offset, re-check
against those numbers.

`world.house`/`world.garage`/`world.dog`/`world.guard` are only captured for
`PLOTS[0]` — they're interaction and animation targets, and a neighbour's
house must not be tappable as your own security panel. The dog's patrol in
`tick()` now moves it in **plot-local x**, since it's a child of the group.

**Rotation is only exact on quarter turns.** Both collision systems are
axis-aligned, so `plotBox()` swaps a footprint's extents for odd multiples of
90°. An arbitrary angle would need a real oriented-box collider; until
something needs one, keep plots on quarter turns. `vecino` is deliberately at
-90° (facing the avenue) so this path is actually exercised rather than
theoretical.

`PLOT_FOOTPRINTS` holds each compound's solid boxes in local space, using the
same numbers `buildHouse()`/`buildGarage()` position their meshes at, so the
two can't drift. `buildingColliders()` maps every plot through `plotBox()`,
then appends the landmarks.

**`COLMADO_POS` is deliberately still a constant.** It's a landmark, not a
plot: nobody owns it, it has no upgrades, and `buildColmado(colPos)` was
already parameterized. Making it a plot would model it wrongly. Landmarks
(the colmado, `PLACEHOLDER_BUILDINGS`) contribute colliders separately.

Moving the house off `x=-2` originally detached the garage from `AVE_X=9` —
the garage used to sit right on the avenue's pavement and now sits in open
ground near the house, with the car crossing that gap to reach the avenue.
That's a real change to the geometry, not an oversight; re-verify it if you
move `PLOTS[0].originX` again.

### Placeholder buildings

`PLACEHOLDER_BUILDINGS` + `buildPlaceholders()` (`js/game.js`) fill out the
block the way the reference map showed it — several buildings clustered
around the colmado and across the avenue — without inventing a purpose,
colour scheme, or detail level the reference doesn't specify for them.
Each is just a body + a roof cap + a skirt band, deliberately plainer than
the house/garage/colmado so they read as "the rest of the block" rather
than competing with the buildings that actually matter for gameplay. They
are still real, solid buildings: `buildingColliders()` maps over the same
`{x,z,w,d}` array to generate their collider boxes, so the car can't drive
through one any more than it can drive through the colmado. If you add
another one, check it against every existing collider *and* both streets
before picking coordinates — `buildPlaceholders()`'s own entries were
re-positioned once already after a couple of them turned out to overlap
C. Marginal's pavement.

`COLMADO_POS` sits west of the avenue and further out in z than the
house/garage specifically to leave `C. MARGINAL` a clear gap to cross
through without slicing into either the colmado's own collider or the
security-fence perimeter (`buildSecurityProps()`'s `sec.doors` posts) — if
you move any of the three, re-check all three still clear each other.
Moving the colmado further from spawn is always safe for the
camera-clipping concern in Camera above (it only widens that margin);
moving it *closer* is the direction that needs re-verifying.

## Audio

**Every sound in the game is synthesized at runtime with the Web Audio API.
There is not one audio file in this repo, on purpose** — the same reasoning
that makes `detailMap()` paint its textures onto a canvas instead of
downloading them:

- **Licensing.** Real merengue/bachata/dembow recordings are somebody's
  copyright, and shipping or hotlinking them would be infringement however
  short the clip. Rhythms and chord patterns are not copyrightable, so
  `merengue()`/`bachata()`/`dembow()` in `js/game.js` play the actual
  *patterns* you'd hear out of a colmado speaker — merengue's tambora with
  its pickup and straight-eighths güira, bachata's beat-4 lift with a
  requinto arpeggio, dembow's boom-ch-boom-chick — without reproducing
  anyone's recording. This is the same rule as the colmado signage: the look
  and feel of the real thing, none of the actual IP.
- **It cannot fail to load.** No download, no decode, no megabytes of
  assets; works offline and inside the single-file artifact build.

If you ever want licensed audio, the hook is deliberate: give a `MUSIC[]`
entry a `src` and have the scheduler play a decoded buffer instead of
calling its pattern function. **Don't delete the synth path** — it's the
fallback, exactly like `makePerson()` is for the character models.

Structure: `masterGain` feeds two independent buses — `musicGain` (the
colmado's speaker, faded by distance in `updateAmbientAudio()`) and
`engineGain` (the car, alive only while driving). Four things to know:

- `scheduleMusic()` schedules **one bar at a time** and re-arms itself, and
  skips synthesis entirely when muted or out of earshot — otherwise it would
  build oscillators every bar for a speaker nobody can hear. Tracks rotate
  every 8 bars so standing outside the colmado cycles the styles instead of
  looping one phrase.
- The engine is three detuned oscillators through a lowpass that **run
  continuously from the moment audio starts**, idling at zero gain. Web
  Audio nodes are one-shot — a stopped oscillator cannot be restarted — so
  starting/stopping them per drive would both click and eventually fail.
  `updateEngineAudio()` only moves frequency and cutoff.
- Engine pitch tracks road speed (measured: 45 Hz idle → 105 Hz at
  `CAR_TOP_SPEED`). There are no gears, so it just climbs — the mapping is
  deliberately compressed, or it turns into a siren at top speed.
- `stopEngineAudio()` is called from **both** `exitDriveMode()` and
  `backToTitle()`. Leaving to the title mid-drive otherwise carries a
  running engine into the menu.

Browsers block audio until a user gesture, so `initAudio()` is called from
the ENTER click, and `toggleMute()` resumes a suspended context.

## Every upgrade is visible — and every track does something

**No upgrade may exist that only changes a number.** If it can be bought, it
can be walked up to and looked at. `visibility.js` asserts exactly this for all
50 purchasable ids: it builds the world without the upgrade, builds it with,
and fails if the scene is identical. An upgrade with no mesh, material change
or size change fails the build.

Two things that test needs to stay honest, both learned by it lying:

- **Seed the RNG before each rebuild.** The scene has deliberate randomness —
  20 foliage trees, wandering NPCs, palm placement, and `randomFit()`. Without
  a fixed seed two rebuilds differ every time and the test passes for *any*
  upgrade including one that renders nothing. It did exactly that once.
- **The signature must include geometry size and scale, not just position and
  colour.** A part that grows with a tier sits at the same coordinates; judging
  by position alone misses it.

Related: `dripFit()` uses `FITS[0]` as its base, deliberately not
`randomFit()`. The player's character rerolling its outfit on every world entry
is wrong on its own terms, and it also made a purchased colour impossible to
tell from a fresh roll landing on the same value.

### The record must carry every track

`emptyUpgrades()` and `homePlotUpgrades()` must list **every** track. CASA,
DRIP and BARRIO were added to the economy one step after those functions were
written and rendered nothing at all until they were added, and MAESTRÍA had to
go in both places for the same reason, because
`buildHouse()` and `buildPlotUpgrades()` read the RECORD and never `S`. If you
add a track, add it in both places or it is invisible no matter how much
geometry exists for it.

`buildPlotUpgrades(plot,parent)` draws everything from `plot.upgrades`.
`buildBarrio()` is block-level (it changes the street, not a compound) and
takes the record for the same reason. `modelCar()` takes the whole vehicle
record, not a paint string — tint, wheels and tier were invisible whenever the
OBJ loaded, because `carExtras()` only ran inside the `makeCar()` fallback.

**Prefer geometry to colour for anything that must be visible.** A colour can
collide with what the base model already uses — the rim tint did, and left two
purchases undetectable. Car mods each add a real part (hubcaps, sidewall bands,
sun strip, exhaust, spoiler, sill trim, roof rails) rather than only recolouring.

### What each track actually does

Every track changes something mechanical, or it is set dressing you stop caring
about. The shape is a **tension**, not five bonuses — two tracks make you more
of a target and three protect you:

| track | function | effect |
|---|---|---|
| SEGURIDAD | `deter()` | beats an incident once it starts |
| BARRIO | `watch()` | makes incidents rarer and weaker — the only thing that stops them starting |
| CASA | `comfort()` | softens losses, cheaper repairs, small daily payback |
| CARRO | `visibility()` | **raises** threat — a nice car gets noticed |
| DRIP | `respect()` | standing and better scratch odds, but **also raises** `visibility()` |
| MAESTRÍA | `masteryBonus()` | multiplies the window and perfect-day bonuses — where the automaticity fade's money goes |

Drip is deliberately not free: looking like you have something is how you
become worth robbing.

### Rendering notes

Floodlight and streetlight cones are additive transparent meshes, **never real
lights** — the toon material sums each light independently and another one
would push a top-lit face past the white clip described in the rendering
conventions. Same for car underglow.

`plotGroups` + `cullPlots()` switch off each plot's `detail` subgroup past
`PLOT_DETAIL_DIST`. Fully upgraded the world is ~2,270 meshes; culling drops
~1,020 of them from across the map. `clearPropAnims()` and `plotGroups=[]` must
be reset in `backToTitle()` or the registries keep a dead scene alive.
Camera sweep and alarm strobe are driven from `tick()` through those
registries, not per-object callbacks.

## Achievements

`ACHIEVEMENTS` in `js/data.js` — 20 of them, 6 hidden. Definitions and `test()`
conditions live in data.js (no DOM); the badge art lives in `js/badges.js`,
which loads **before ui.js on the core path** and pulls in no THREE.

**Every badge is its own drawing** — a different silhouette (triangle, crown
cap, slab, map, shield, chain, ribbon, dial, teardrop, arch, domino, gear,
banknote stack, moon, ticket, umbrella, cracked slab, swatch card, empty
frame) with its own motif and palette. Not one frame recoloured: a wall of
identical discs is a spreadsheet, and the collection only reads as a
collection when the shapes are told apart at thumbnail size. `badges_test.js`
pixel-hashes all of them and **fails on any two that match**.

Painted on canvas at runtime like `detailMap()` does its textures, so the set
costs nothing to download and there's no sprite sheet to keep in sync. Cached
per `(id,size,state)` forever.

- A **locked** badge is the same drawing desaturated in place, not a
  placeholder — you can see the shape you're missing.
- A **hidden** one is a marked silhouette. Hidden is the point: a goal you can
  see is a checklist, and hidden ones are the only unpredictable surface left
  once the visible ones are known.
- `BADGE_ART` misses fall back to `plaque()`, deliberately plain so an
  undrawn badge looks undrawn rather than quietly passing for a real one.

`checkAchievements()` runs after every log, purchase and incident, so **keep
`test()` cheap** — read a counter, never walk history. Anything that would
need a year of log is a running counter in `S.stats` instead (`earlyAM`,
`lateNight`, `colmadoRun`, `waterDays`, `aveSpan`, `jackpot`, `rebuilt`).
A throwing `test()` is caught and treated as false: a broken achievement must
never break a habit log.

`onAchievement` is the hook ui.js sets — data.js raises unlocks through it
rather than touching the DOM. The toast shows **the badge**, not a line of
text; drawing twenty different things is pointless if the unlock doesn't show
you the new one. `#achToast` lives outside `#game` because most achievements
complete while logging habits, where the 3D world isn't loaded.

`TERCO` (lost a long streak, came back) is recorded in `rollDay()` rather than
tested from history — "used to have 20 days" isn't visible in the log once
it's gone.

## Known deliberate non-features

- No cloud save / accounts — see Backup above.
- No camera collision — see Camera above.
- No collision against porch columns, awnings, street furniture, or NPCs —
  see Collision above; only `buildingColliders()`'s boxes (house, garage,
  colmado, and the placeholder buildings) are solid.
- Workout schedule (`SCHED`) is a fixed Mon-Sat push/pull/legs split with
  Sun/Thu off — not user-configurable by design.

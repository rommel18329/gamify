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

No build step, no dependencies. Either:
- Open `index.html` directly in a browser, or
- Serve the folder (`python3 -m http.server`) and open it over http — needed
  if you want the Google Fonts `@import` in `css/styles.css` to load, though
  the app works fine without it (falls back to a system monospace font).

There is no test suite. Verify changes by actually loading the page and
clicking through: ENTER the world, open LOG/STATS/the security and garage
sheets, and check the browser console for errors. A quick way to drive it
headlessly is Playwright against `/opt/pw-browsers/chromium` (see recent
git history / PR descriptions for example scripts) — screenshot after
`ENTER` and after any lighting/geometry/camera change, since those bugs are
visual and won't throw.

## File layout

```
index.html          shell: markup + <script> tags in load order, nothing else
css/styles.css       all styling
js/errors.js         window.onerror -> visible on-screen error box (loads first)
js/vendor/three.min.js   Three.js r128, vendored verbatim, MIT licensed
js/vendor/cannon.js  cannon.js (the original, not cannon-es), vendored
                     verbatim, MIT licensed — drives the car, see "Car physics"
js/data.js           state, save/load, economy, habits/vitals math (no DOM/THREE)
js/carphysics.js     from-scratch car physics engine (no THREE, no DOM) — the
                     fallback if vendor/cannon.js fails to load, see "Car physics"
js/models.js         loads the CC0 rigged characters + car, recolours them into
                     outfits, drives their animation mixers
assets/              CC0 model files (characters/*.glb, vehicles/*.obj+mtl)
js/game.js           the 3D scene: world building (one function per structure —
                     buildHouse/buildGarage/buildColmado/etc., all called from
                     buildWorld()), character/car/prop meshes, camera, input,
                     movement (walk + drive), the render loop
js/ui.js             DOM glue: renders sheets (LOG/STATS/SECURITY/GARAGE/BACKUP)
                     from state in data.js, wires up onclick handlers
manifest.json, icon.svg   PWA install metadata
```

Load order in `index.html` matters: `errors.js` must install the error
handler before anything else can throw; `three.min.js` before `game.js`
touches `THREE`; `data.js` before `game.js`/`ui.js` read state or economy
functions. Everything is classic (non-module) scripts sharing one global
scope on purpose — keep it that way unless you're deliberately introducing
a build step, since the app is meant to be openable with no tooling.

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

**Five parallel tracks**, `TRACKS` in `js/data.js`: SEGURIDAD, LA CASA, EL
CARRO, EL DRIP, EL BARRIO. Prices are staggered **across** tracks, not within
one — DRIP is the cheap track (120–7,000), CASA and BARRIO the middle,
SEGURIDAD spans everything, CARRO is the long haul. One linear ladder always
produces a wall you stare at for a week; five never do, because something
cheap is always pending on another track while you save.

Measured at a fresh save: **37 things buyable, 💵120 to 💵18,000, 15 of them
under 500.** If pacing runs dry, **add upgrades — never inflate the habit
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

People and the car are real rigged models: Quaternius "Ultimate Modular Men"
(**CC0 1.0**, verified from the pack's own `License.txt` — no attribution
required) plus a CC0 car. The hand-built `makePerson()`/`makeCar()` primitives
are still there as a **fallback**: every call site is
`modelPerson(...)||makePerson(...)`, and `loadAssets()` always fires its
callback even when a download fails, so a broken asset costs you the good
characters — never a black screen or a hung loading screen. Don't remove that
fallback path.

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
43 purchasable ids: it builds the world without the upgrade, builds it with,
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
written and rendered nothing at all until they were added, because
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

## Known deliberate non-features

- No cloud save / accounts — see Backup above.
- No camera collision — see Camera above.
- No collision against porch columns, awnings, street furniture, or NPCs —
  see Collision above; only `buildingColliders()`'s boxes (house, garage,
  colmado, and the placeholder buildings) are solid.
- Workout schedule (`SCHED`) is a fixed Mon-Sat push/pull/legs split with
  Sun/Thu off — not user-configurable by design.

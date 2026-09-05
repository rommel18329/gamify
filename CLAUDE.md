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
js/data.js           state, save/load, economy, habits/vitals math (no DOM/THREE)
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

`S` is one big object, persisted to `localStorage` under key `sprout_v2`
via `save()`. `blank()` is the source of truth for its shape; `migrate()`
fills in any missing keys from `blank()` so old saves don't break when a
field is added. If you remove a field from `blank()`, you don't need to
migrate anything away — `migrate()` only adds, and stale keys in an old
save are simply ignored.

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
(`'walk'` or `'drive'`), both built on two small shared helpers —
`seekTarget(pos, target, speed, dt)` (move a position toward a point,
returns whether it arrived/is moving and the heading to face) and
`smoothYaw(current, target, rate, dt)` (turn toward a heading at a given
rate). The walking player and the driven car each call these with their own
speed/turn-rate constants rather than duplicating the seek-and-turn math.
`enterDriveMode()`/`exitDriveMode()` (also `js/game.js`) swap which
transform `handleTap()` sends taps to, hide/show `playerGroup`, and
toggle the `#exitVehicleBtn` HUD button. `backToTitle()` resets
`controlMode` back to `'walk'` — don't remove that, or leaving to the title
screen mid-drive would carry the mode into the next session with the
player mesh still hidden.

The car itself is a backdrop-adjacent object, not inside the garage: see
`CAR_SPOT`/`buildGarage()`'s comment in `js/game.js` for why (the garage is
a solid, unopened box — parking the car at the same coordinates hid it
completely). `rebuildCar()` in `js/ui.js` (called after a paint/mod
purchase) preserves the car's *current* position/rotation rather than
resetting to `CAR_SPOT`, since the car may not be parked there anymore
once it's driveable.

## Known deliberate non-features

- No cloud save / accounts — see Backup above.
- No camera collision — see Camera above.
- Workout schedule (`SCHED`) is a fixed Mon-Sat push/pull/legs split with
  Sun/Thu off — not user-configurable by design.

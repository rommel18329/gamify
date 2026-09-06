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
without looking wrong. `enterDriveMode()`/`exitDriveMode()` (also
`js/game.js`) swap which transform `handleTap()` sends taps to, hide/show
`playerGroup`, and toggle the `#exitVehicleBtn` HUD button. `backToTitle()`
resets `controlMode` back to `'walk'` — don't remove that, or leaving to the
title screen mid-drive would carry the mode into the next session with the
player mesh still hidden.

The car itself is a backdrop-adjacent object, not inside the garage: see
`CAR_SPOT`/`buildGarage()`'s comment in `js/game.js` for why (the garage is
a solid, unopened box — parking the car at the same coordinates hid it
completely). `rebuildCar()` in `js/ui.js` (called after a paint/mod
purchase) preserves the car's *current* position/rotation rather than
resetting to `CAR_SPOT`, since the car may not be parked there anymore
once it's driveable.

### Car physics

Driving does **not** reuse `seekTarget()` — a car moving in a straight line
directly toward the tapped point regardless of which way it's facing reads
as crabbing sideways into its own turns, since a vehicle can only actually
move along its own heading.

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
drift from the visual mesh. `driveCarCannon()` in `js/game.js` feeds it
`engineForce`/`steer`/`brake` from whichever control is active — WASD/arrow
keys (`driveKeys`) map directly onto them like a real pedal and wheel;
tap-to-drive (`driveTarget`) runs a small steering controller that aims for
the same two inputs — then steps the world and copies the settled chassis
transform onto `world.car`. `js/carphysics.js` (below) is the fallback if
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
  `driveTarget` (and, for the fallback car, zeroes `carPhys.v`/`.vrot`)
  rather than leaving the seek/steering logic pushing into the wall every
  frame, which would otherwise jitter the position back and forth against
  it.

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
`HOME_X` below) — the avenue is now a through street the car drives *to*,
not one the garage parks directly on.

`streetSign()` builds each sign as **two single-sided plates back to
back**, not one plate with a `DoubleSide` material — a `DoubleSide`
material mirrors the same texture onto its back face, which read as
reversed, unreadable text to traffic approaching from the other direction
the first time this was built. If you add another sign, copy that pattern
rather than reaching for `DoubleSide` on a textured plane.

### HOME_X — the house sits across C. Marginal from the colmado

`HOME_X` (`js/game.js`) is the house/garage/yard compound's shared x,
matching the owner's own reference map: the house faces the colmado
directly across `C. MARGINAL`, in the same way `COLMADO_POS` anchors the
colmado's own block. Every site that used to hardcode its own x assuming a
house at `x=-2` — `buildHouse()`, `buildGarage()`, `CAR_SPOT`, the walkway
in `buildGround()`, the front-door/board spots in `spots()`, `buildBoard()`,
`buildPlayer()`'s spawn, every prop in `buildSecurityProps()` (including
the fence posts and the dog's per-frame patrol x in `tick()`), and the
house/garage entries in `buildingColliders()` — now reads `HOME_X` (or a
fixed offset from it) instead. **z was deliberately left untouched**: the
existing security-fence perimeter already reaches to within ~3 units of
C. Marginal's south edge, closely matching the colmado's own ~3.5-unit
clearance on the street's other side, so the two properties already faced
each other across the street without moving either one in z — only x
needed to change. `HOME_X` must be declared *before* `CAR_SPOT`/
`COLMADO_POS` in the file, since those read it immediately at module-load
time; top-level `const` has no hoisting the way a function declaration
does, unlike everything that merely *uses* `HOME_X` from inside a function
body, which is free to be declared anywhere textually since it won't run
until called.

Moving the house off `x=-2` detached the garage from `AVE_X=9` — the
garage used to sit right on the avenue's own pavement (same x), and now
sits in open ground near the house instead, with the car crossing that gap
to reach the avenue rather than pulling straight onto it. That's a real
change to the geometry, not an oversight: re-verify it if you ever move
`HOME_X` again, the same way any `COLMADO_POS` move gets re-verified below.

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

## Known deliberate non-features

- No cloud save / accounts — see Backup above.
- No camera collision — see Camera above.
- No collision against porch columns, awnings, street furniture, or NPCs —
  see Collision above; only `buildingColliders()`'s boxes (house, garage,
  colmado, and the placeholder buildings) are solid.
- Workout schedule (`SCHED`) is a fixed Mon-Sat push/pull/legs split with
  Sun/Thu off — not user-configurable by design.

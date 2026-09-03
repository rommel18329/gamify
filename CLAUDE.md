# Sprout

A gamified habit tracker. Checking off real habits (water, hygiene, gym,
journaling, sleep schedule, work discipline) and logging meals earns
in-game cash and "standing," which buys home-security upgrades and a
vehicle in a 3D world you walk around. Missing your property's deterrence
lets random "incidents" (break-ins) succeed and cost you cash; defending
them in person (as a small raid where you tap intruders) pays out instead.

This is a personal side project, unrelated to any CRM work — don't conflate
the two.

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
js/game.js           the 3D scene: world building, character/car/prop meshes,
                     camera, input, the render loop
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

Money and "standing" only ever move through `earn()` — it applies the
streak multiplier, XP, and level-ups in one place. Don't add cash/standing
anywhere else.

## Backup

`localStorage` is the *only* copy of a save — there's no server. `exportSave()`/
`importSave()` in `data.js` and the BACKUP SAVE sheet in `ui.js` exist so a
player can get a copy out. Don't remove that path; if you change `S`'s shape,
`importSave()`'s call to `migrate()` should keep old backups loadable.

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
`camDist=9.5`), always looking at the player and converging toward its
ideal position with a `lerp`. It has **no collision** — it can end up
inside nearby geometry if the player stands close enough to a building
and looks toward it. The player's spawn point (`playerGroup.position` in
`buildWorld()`) was chosen specifically to keep the *default* camera clear
of the colmado building (it used to converge to a resting spot several
units inside it, rendering as a wall of solid color filling the screen —
the classic "camera clipped through geometry" bug, and the first thing
every player saw). If you move the spawn point, the world layout, or
`camDist`/default `camPitch`, re-check that the converged camera position
(`player.pos + camDist*cos(pitch)` roughly, in the direction opposite
`camYaw`) doesn't land inside a building.

## Known deliberate non-features

- No cloud save / accounts — see Backup above.
- No camera collision — see Camera above.
- Workout schedule (`SCHED`) is a fixed Mon-Sat push/pull/legs split with
  Sun/Thu off — not user-configurable by design.

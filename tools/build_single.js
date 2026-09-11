/* Build the whole game into ONE self-contained .html file.

   Two things this file has to survive that the normal index.html does not:

   1. file:// -- Chrome refuses to fetch a module script from file:// (CORS,
      origin 'null'), so opening index.html by double-clicking leaves
      window.THREE undefined and ENTER THE WORLD stuck on "STILL LOADING".
   2. A Content-Security-Policy that allows inline scripts but refuses
      `data:` in script position -- which is what the published artifact
      runs under, and which broke the previous data:-URI-import-map build
      the same way.

   Both are solved the same way: NO script is ever fetched. The six engine
   ES modules are transformed into one plain inline <script> by
   tools/esm_to_classic.js, and every asset is inlined as a data: URI.

   Run: node tools/build_single.js [outfile]     (default: sprout.html) */
const fs = require('fs');
const path = require('path');
const { esmToClassic } = require('./esm_to_classic.js');
const ROOT = path.join(__dirname, '..');
const R = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const b64 = (p, mime) => `data:${mime};base64,` +
  fs.readFileSync(path.join(ROOT, p)).toString('base64');

/* ---- the engine, as one classic script ------------------------------- */
const T = '__THREE_NS__';
let engine = '';
engine += esmToClassic(R('js/vendor/three.module.js'), 'three 0.169', T, {});
engine += esmToClassic(R('js/vendor/jsm/utils/BufferGeometryUtils.js'),
  'BufferGeometryUtils', '__BGU__', { three: T });
engine += esmToClassic(R('js/vendor/jsm/loaders/GLTFLoader.js'), 'GLTFLoader',
  '__GLTF__', { three: T, '../utils/BufferGeometryUtils.js': '__BGU__' });
engine += esmToClassic(R('js/vendor/jsm/loaders/OBJLoader.js'), 'OBJLoader',
  '__OBJ__', { three: T });
engine += esmToClassic(R('js/vendor/jsm/loaders/MTLLoader.js'), 'MTLLoader',
  '__MTL__', { three: T });
engine += esmToClassic(R('js/vendor/jsm/utils/SkeletonUtils.js'), 'SkeletonUtils',
  '__SKU__', { three: T });
engine += esmToClassic(R('js/vendor/three-vrm.module.js'), 'three-vrm 2.1.3',
  '__VRM__', { three: T });

/* Same globals index.html's module bootstrap builds, same reasoning:
   ColorManagement off (measured -- on, the whole game renders ~45% darker
   against light values tuned for r128), and window.THREE is a fresh mutable
   object so THREE.GLTFLoader can be attached to it. */
engine += `
${T}.ColorManagement.enabled = false;
window.THREE = Object.assign({}, ${T}, {
  GLTFLoader: __GLTF__.GLTFLoader, OBJLoader: __OBJ__.OBJLoader,
  MTLLoader: __MTL__.MTLLoader, SkeletonUtils: __SKU__
});
window.VRMLoaderPlugin = __VRM__.VRMLoaderPlugin;
window.VRMUtils = __VRM__.VRMUtils;
`;

/* ---- assets, inlined as raw base64 and PARSED, never fetched ----------
   NOT data: URIs. A data: URI still goes through the loader's FileLoader,
   which is an XHR/fetch -- and that is governed by CSP's connect-src, not
   script-src. Measured behind a strict policy: every model came back
   "Refused to connect to 'data:model/gltf-binary;base64,...'", the game
   silently fell through to the makePerson()/makeCar() primitives, and the
   good characters and car were simply gone with no visible error. Handing
   the bytes straight to GLTFLoader.parse()/OBJLoader.parse() removes the
   network step altogether, so no connect-src policy can reach it. */
const rawB64 = p => fs.readFileSync(path.join(ROOT, p)).toString('base64');
const hoodieB64 = rawB64('assets/characters/Casual_Hoodie.glb');
const casualB64 = rawB64('assets/characters/Casual_2.glb');
const mtlB64 = rawB64('assets/vehicles/NormalCar1.mtl');
const objB64 = rawB64('assets/vehicles/NormalCar1.obj');

let models = R('js/models.js');
const sub = (old, neu, what) => {
  if (!models.includes(old)) throw new Error(`anchor not found: ${what}`);
  models = models.replace(old, neu);
};
sub(`const CHAR_MODELS={ hoodie:'characters/Casual_Hoodie.glb', casual:'characters/Casual_2.glb' };`,
`function __b64buf(s){ const b=atob(s), u=new Uint8Array(b.length);
  for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u.buffer; }
function __b64txt(s){ return new TextDecoder().decode(new Uint8Array(__b64buf(s))); }
const CHAR_MODELS={ hoodie:${JSON.stringify(hoodieB64)}, casual:${JSON.stringify(casualB64)} };
const __CAR_MTL=${JSON.stringify(mtlB64)}, __CAR_OBJ=${JSON.stringify(objB64)};`,
    'CHAR_MODELS');

sub(`    gl.load(ASSET_BASE+CHAR_MODELS[n],
      g=>{ ASSETS.chars[n]={scene:g.scene, animations:g.animations}; finish(); },
      undefined,
      ()=>finish());   // missing character -> primitive fallback, not a crash`,
`    try{
      gl.parse(__b64buf(CHAR_MODELS[n]), '',
        g=>{ ASSETS.chars[n]={scene:g.scene, animations:g.animations}; finish(); },
        ()=>finish());
    }catch(e){ finish(); }   // bad asset -> primitive fallback, not a crash`,
    'character parse');

sub(`    const dir=ASSET_BASE+'vehicles/';
    new THREE.MTLLoader().setPath(dir).load('NormalCar1.mtl',
      mats=>{
        mats.preload();
        new THREE.OBJLoader().setMaterials(mats).setPath(dir)
          .load('NormalCar1.obj', o=>{ ASSETS.car=o; finish(); }, undefined, ()=>finish());
      }, undefined, ()=>finish());`,
`    try{
      const mats=new THREE.MTLLoader().parse(__b64txt(__CAR_MTL), '');
      mats.preload();
      ASSETS.car=new THREE.OBJLoader().setMaterials(mats).parse(__b64txt(__CAR_OBJ));
      finish();
    }catch(e){ finish(); }`,
    'vehicle parse');

/* The bundled VRM preset (15MB) is NOT embedded -- base64 alone pushes it
   past the artifact host's 16MB cap on its own. VRM_PRESETS ships empty
   here; "Your own upload" in the CHARACTER sheet reads a file the player
   picks locally and needs nothing pre-bundled, so it works exactly as in
   the served app. */
const presetRe = /const VRM_PRESETS=\{[\s\S]*?\n\};/;
if (!presetRe.test(models)) throw new Error('anchor not found: VRM_PRESETS');
models = models.replace(presetRe, `const VRM_PRESETS={}; // single-file build: no bundled preset`);

/* ---- the two script blobs, in the order index.html loads them ---------- */
/* errors/data/badges/ui stay a SEPARATE, EARLY script. This is the core-path
   guarantee ("the default screen is the habit list, and it must never load
   the 3D world"): putting all of it in one blob behind the engine makes the
   habit checklist wait on ~5MB of three.js before it can render at all. */
const coreBlob = ['js/errors.js', 'js/data.js', 'js/badges.js', 'js/ui.js']
  .map(R).join('\n;\n');
const gameBlob = [R('js/vendor/cannon.js'), R('js/carphysics.js'), models, R('js/game.js')]
  .join('\n;\n');

/* ---- the page --------------------------------------------------------- */
const indexHtml = R('index.html');
const bodyMatch = indexHtml.match(/<body>([\s\S]*)<\/body>/);
if (!bodyMatch) throw new Error('could not find <body> in index.html');
let body = bodyMatch[1];
/* COMMENTS FIRST, script tags second. index.html's own prose contains the
   literal text "<script>" inside an HTML comment; a real parser knows comment
   content isn't markup but this is a naive regex, and stripping scripts first
   made it treat that prose as a real opening tag and swallow the actual
   bootstrap along with it. */
body = body.replace(/<!--[\s\S]*?-->\s*/g, '').replace(/<script[^>]*>[\s\S]*?<\/script>\s*/g, '');

const out = `<title>Sprout</title>
<style>
${R('css/styles.css')}
</style>
${body}
<script>
${coreBlob}
</script>
<script>
${engine}
${gameBlob}
</script>
`;

const outPath = process.argv[2] || path.join(ROOT, 'sprout.html');
fs.writeFileSync(outPath, out);
console.log('wrote', outPath, (fs.statSync(outPath).size / 1048576).toFixed(2) + 'MB');

/* Turn a well-formed ES module into a classic-script IIFE.

   WHY THIS EXISTS: the single-file build (tools/build_single.js) has to run
   under a Content-Security-Policy that allows inline scripts but REFUSES
   `data:` URIs in script position -- measured, not assumed: serving the
   previous data:-URI-import-map build behind a realistic artifact CSP
   produced "Refused to load the script 'data:text/javascript;base64,...'"
   for every one of the six engine modules, `window.THREE` stayed undefined,
   and ENTER THE WORLD hung on "STILL LOADING" forever. Exactly the bug the
   owner reported. An import map cannot point at an inline <script>, so the
   only way to ship an ES-module engine inside one CSP-safe HTML file is to
   stop it being ES modules at all.

   This is a deliberately DUMB transform, not a real bundler, and it is safe
   only because every file it is pointed at has the same tidy shape (checked
   before writing it: no `import.meta`, no `export default`, no dynamic
   import, imports only at the very top, exports only at line start):
     import { A, B } from 'x';   ->  const { A, B } = <var for x>;
     import * as NS from 'x';    ->  const NS = <var for x>;
     export { A, B as C };       ->  (recorded, emitted in the return object)
     export function f(){}       ->  function f(){}  (recorded)
   The body is then wrapped in a strict-mode IIFE returning its exports.
   'use strict' is not optional: ES modules are implicitly strict and a plain
   function body is not, so without it the wrapped code would silently change
   semantics. Anything it cannot account for THROWS rather than emitting a
   subtly wrong bundle -- a build that fails loudly beats one that ships a
   broken engine. */
function esmToClassic(src, label, varName, importMap){
  let out = src;

  out = out.replace(/^import\s+\*\s+as\s+(\w+)\s+from\s+'([^']+)';?[ \t]*$/gm, (m, ns, from) => {
    if(!(from in importMap)) throw new Error(`${label}: unmapped import '${from}'`);
    return `const ${ns} = ${importMap[from]};`;
  });
  out = out.replace(/^import\s*\{([\s\S]*?)\}\s*from\s*'([^']+)';?[ \t]*$/gm, (m, names, from) => {
    if(!(from in importMap)) throw new Error(`${label}: unmapped import '${from}'`);
    return `const {${names}} = ${importMap[from]};`;
  });
  if(/^[ \t]*import[\s{*'"]/m.test(out)) throw new Error(`${label}: unhandled import statement remains`);

  const exports = [];                       // [exportedName, localName]
  out = out.replace(/^export\s*\{([\s\S]*?)\}[ \t]*;?[ \t]*$/gm, (m, names) => {
    names.split(',').forEach(n => {
      n = n.trim(); if(!n) return;
      const as = n.split(/\s+as\s+/);
      exports.push(as[1] ? [as[1].trim(), as[0].trim()] : [as[0].trim(), as[0].trim()]);
    });
    return '';
  });
  out = out.replace(/^export\s+(function|const|let|class)\s+(\w+)/gm, (m, kw, n) => {
    exports.push([n, n]); return `${kw} ${n}`;
  });
  if(/^[ \t]*export[\s{]/m.test(out)) throw new Error(`${label}: unhandled export statement remains`);
  if(!exports.length) throw new Error(`${label}: no exports found -- transform almost certainly missed them`);

  const ret = exports.map(([e, l]) => e === l ? e : `${JSON.stringify(e)}: ${l}`).join(', ');
  return `/* ${label} */\nconst ${varName} = (function(){\n'use strict';\n${out}\nreturn {${ret}};\n})();\n`;
}
module.exports = { esmToClassic };

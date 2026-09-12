# Garment parts

Meshes only — no animation clips — extracted from the Quaternius **Ultimate
Modular Men** pack (**CC0 1.0**, no attribution required), the same pack
`../Casual_Hoodie.glb` and `../Casual_2.glb` come from. Every character in
that pack is built on one shared 62-bone rig with `<Character>_Body`,
`_Head`, `_Legs` and `_Feet` as deliberately interchangeable nodes, which is
what lets these be worn by the player's character.

| file | pack node | worn as |
|---|---|---|
| `Beach_Body.glb`   | `Beach_Body`   | franela (sleeveless top + bare arms) |
| `Beach_Legs.glb`   | `Beach_Legs`   | gym shorts |
| `Farmer_Pants.glb` | `Farmer_Pants` | baggy pants |

The pack's own glTF exports carry all 24 animation clips and run ~3 MB each.
These were re-exported through three.js's `GLTFExporter` with every other
node and every clip dropped, which is the whole difference between 126–333 KB
and 3 MB. The clips are not needed here: the walk cycle is already driven from
the character's own rig.

Nothing in this directory was modelled for this project. The hoodie, t-shirt,
denim shorts and jeans are not here at all — they are parts of the two
character GLBs one level up, which are downloaded for the world anyway.

Source: https://quaternius.com/packs/ultimatemodularcharacters.html

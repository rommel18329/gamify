# Garment and hair parts

Meshes only — no animation clips — from the Quaternius **Ultimate Modular
Men** pack (**CC0 1.0**, no attribution required), the same pack
`../Casual_Hoodie.glb` and `../Casual_2.glb` come from. Every character in
that pack is built on one shared 62-bone rig with `<Character>_Body`,
`_Head`, `_Legs` and `_Feet` as deliberately interchangeable nodes, which is
what lets these be worn by the player's character.

| file | from | worn as |
|---|---|---|
| `Beach_Body.glb`   | `Beach_Body`   | franela (sleeveless top + bare arms) |
| `Farmer_Pants.glb` | `Farmer_Pants` | baggy pants |
| `Shorts_Denim.glb` | `Casual2_Legs`, hemmed | denim shorts, 2.5in below the knee |
| `Shorts_Gym.glb`   | `Farmer_Pants`, hemmed | gym shorts, 1.5in above the knee |
| `Hair_Waves.glb`   | `Beach_Head`       | waves |
| `Hair_Fade.glb`    | `Suit_Head`        | side part |
| `Hair_Long.glb`    | `Adventurer_Head`  | long + beard |
| `Hair_Mohawk.glb`  | `Punk_Head`        | mohawk |

The pack's own glTF exports carry all 24 animation clips and run ~3 MB each.
These were re-exported through three.js's `GLTFExporter` with every other
node and every clip dropped, which is the whole difference between 112–377 KB
and 3 MB. The clips are not needed here: the walk cycle is already driven from
the character's own rig.

## The two hemmed pairs

The pack ships exactly two shorts and **neither sits where a real pair does** —
both are mid-thigh. So the two here are the pack's own full-length trousers
cut to length, which is a change of length on premade geometry, not a mesh
anyone modelled. Three things that had to be right (all measured in bind pose,
where the knee is `y = 0.5075` and one inch is `0.02636`):

- **Cut, don't stretch.** A shorts mesh is weighted to the upper leg only;
  stretching one down past the knee gives a leg that cannot bend. Cutting a
  full-length trouser keeps the authored upper-leg *and* lower-leg weights, so
  a below-the-knee hem still bends.
- **The hem is clamped, not ragged.** A triangle wholly below the line is
  dropped; one straddling it is kept with its low vertices pulled up to the
  line. That leaves a flat hem edge rather than a torn one.
- **Each pair carries the bare leg it exposes**, because cutting a trouser leg
  off reveals a shin the trouser was the only thing covering. The two travel
  as one group — a wardrobe slot swaps one node. The grafted leg is narrowed
  to 84% *only where the trouser covers it*, ramped off over 0.06 units:
  a slim jean sits within a hair of the bare leg and two nearly coincident
  surfaces z-fight, which renders as torn holes across the thigh. Insetting
  the whole leg instead would have thinned the visible shin into a spindle.

Nothing in this directory was modelled for this project. The hoodie, t-shirt,
jeans and the stock hairstyle are not here at all — they are parts of the two
character GLBs one level up, which are downloaded for the world anyway.

Source: https://quaternius.com/packs/ultimatemodularcharacters.html

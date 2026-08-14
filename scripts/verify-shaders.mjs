/**
 * Asserts that world/shaders.ts still carries the exact GLSL from world/engine.js.
 *
 * The shader source *is* the tiny-planet effect: the curvature displacement, the
 * day/night uniform contract, and the fog/glow blends all live there. The r3f
 * rewrite is only allowed to change the plumbing around them, so this runs as
 * part of `npm run build` and fails loudly on any drift.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const NAMES = [
  'vert',
  'fragLit',
  'fragGround',
  'fragFlat',
  'fragGlow',
  'vertPath',
  'fragPath',
  'skyVert',
  'skyFrag',
];

/** Pull the body of each `const <name> = `...`;` template literal out of a source file. */
function extract(source, file) {
  const found = {};
  for (const name of NAMES) {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*\`([\\s\\S]*?)\`;`);
    const match = source.match(re);
    if (!match) throw new Error(`${file}: could not find shader \`${name}\``);
    found[name] = match[1];
  }
  return found;
}

const reference = extract(readFileSync(join(root, 'src/world/engine.js'), 'utf8'), 'engine.js');
const ported = extract(readFileSync(join(root, 'src/world/shaders.ts'), 'utf8'), 'shaders.ts');

const drifted = NAMES.filter((name) => reference[name] !== ported[name]);

if (drifted.length > 0) {
  console.error(
    `\nShader drift detected in: ${drifted.join(', ')}\n\n` +
      `world/shaders.ts must match world/engine.js byte-for-byte. Revert the edit, or\n` +
      `change engine.js in lockstep if the effect itself is genuinely being revised.\n`,
  );
  process.exit(1);
}

console.log(`shaders ok — ${NAMES.length}/${NAMES.length} match engine.js byte-for-byte`);

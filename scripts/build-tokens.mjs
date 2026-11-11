// Turns src/design-system/tokens.json (copied from the Evalve Design System)
// into src/design-system/tokens.css: one CSS variable per token.
// Run with `npm run gen:tokens` after you copy in a newer tokens.json.
import { readFileSync, writeFileSync } from "node:fs";

const src = new URL("../src/design-system/tokens.json", import.meta.url);
const out = new URL("../src/design-system/tokens.css", import.meta.url);
const tokens = JSON.parse(readFileSync(src, "utf8"));

const light = [];
const dark = [];

// Colors and shadows have a value per theme; everything else is one value.
for (const family of ["color", "shadow"]) {
  for (const t of tokens[family]?.tokens ?? []) {
    const v = typeof t.value === "string" ? { light: t.value } : t.value;
    light.push(`  --${t.name}: ${v.light};`);
    if (v.dark && v.dark !== v.light) dark.push(`  --${t.name}: ${v.dark};`);
  }
}
for (const family of ["spacing", "radius"]) {
  for (const t of tokens[family]?.tokens ?? []) light.push(`  --${t.name}: ${t.value};`);
}
for (const [name, stack] of Object.entries(tokens.type?.families ?? {})) {
  light.push(`  --font-${name}: ${stack};`);
}

const css = `/* evalve: generated from tokens.json by scripts/build-tokens.mjs. Do not edit by hand. */
:root {
${light.join("\n")}
}

[data-theme="dark"] {
${dark.join("\n")}
}
`;
writeFileSync(out, css);
console.log(`tokens.css: ${light.length} tokens, ${dark.length} dark overrides`);

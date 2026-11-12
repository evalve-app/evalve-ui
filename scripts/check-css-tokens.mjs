// Fails when src/app.css holds a color that is not a design token.
//
// The design system has tokens for color, shadow, spacing, radius, and font
// family (src/design-system/tokens.css). It has no token for a size such as a
// width or a font size, so the check does not look at px values.
import { readFileSync } from "node:fs";

const file = new URL("../src/app.css", import.meta.url);
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\(/;

const found = [];
readFileSync(file, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
  .split("\n")
  .forEach((line, i) => {
    const match = line.match(RAW_COLOR);
    if (match) found.push(`  src/app.css:${i + 1}: ${match[0]}`);
  });

if (found.length) {
  console.error("src/app.css has a color that is not a design token. Use a var(--…) from src/design-system/tokens.css:");
  console.error(found.join("\n"));
  process.exit(1);
}

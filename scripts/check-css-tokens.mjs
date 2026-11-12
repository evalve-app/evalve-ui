// Fails when src/app.css holds a color that is not a design token.
//
// The design system has tokens for color, shadow, spacing, radius, and font
// family (src/design-system/tokens.css). It has no token for a size such as a
// width or a font size, so the check does not look at px values.
import { readFileSync } from "node:fs";

const file = new URL("../src/app.css", import.meta.url);
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|oklab|color)\(/;

// The CSS named colors. "transparent", "currentcolor", and "inherit" are not
// here: they are not colors of their own, so they need no token.
const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood
  cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray
  darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
  darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue
  firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew
  hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue
  mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred
  midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue
  slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
  whitesmoke yellow yellowgreen`.split(/\s+/),
);
// The properties that can hold a color.
const COLOR_PROPERTY = /^(?:color|background|background-color|background-image|border(?:-[a-z-]+)?|outline(?:-color)?|box-shadow|text-shadow|text-decoration(?:-color)?|fill|stroke|caret-color|accent-color|column-rule(?:-color)?)$/;

// The first color in a declaration value that is not a token, or null.
function rawColor(property, value) {
  // A token name or a URL can hold a color word, for example var(--text-red).
  const plain = value.replace(/var\(--[\w-]+/g, "var(").replace(/url\([^)]*\)/g, "url()");
  const raw = plain.match(RAW_COLOR);
  if (raw) return raw[0];
  if (!COLOR_PROPERTY.test(property)) return null;
  return plain.toLowerCase().match(/[a-z]+/g)?.find((word) => NAMED.has(word)) ?? null;
}

// Comments become spaces, so that the line numbers stay correct.
const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

const found = [];
// Each innermost { … } block holds declarations, not selectors.
for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
  for (const declaration of block[1].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)) {
    const color = rawColor(declaration[1].toLowerCase(), declaration[2]);
    if (!color) continue;
    const line = css.slice(0, block.index + 1 + declaration.index).split("\n").length;
    found.push(`  src/app.css:${line}: ${declaration[1]}: ${color}`);
  }
}

if (found.length) {
  console.error("src/app.css has a color that is not a design token. Use a var(--…) from src/design-system/tokens.css:");
  console.error(found.join("\n"));
  process.exit(1);
}

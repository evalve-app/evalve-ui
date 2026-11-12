// Signs in to the dev server and saves a screenshot of one route.
//
//   npm run screenshot -- /agents out.png
//
// Needs `npm run dev` in a second terminal, and KITARU_TEST_USERNAME and
// KITARU_TEST_PASSWORD in .env.local. Uses the Chromium that is installed on
// this computer (set CHROMIUM_PATH if it is not on the PATH).
import { execSync } from "node:child_process";
import { chromium } from "playwright-core";

const [route = "/agents", out = "screenshot.png"] = process.argv.slice(2);
const base = process.env.APP_URL ?? "http://localhost:5173";
const username = process.env.KITARU_TEST_USERNAME;
const password = process.env.KITARU_TEST_PASSWORD;

if (!username || !password) {
  console.error("Set KITARU_TEST_USERNAME and KITARU_TEST_PASSWORD in .env.local. See .env.example.");
  process.exit(2);
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  for (const name of ["chromium-browser", "chromium", "google-chrome"]) {
    try {
      return execSync(`command -v ${name}`, { shell: "/bin/sh" }).toString().trim();
    } catch {
      // Try the next name.
    }
  }
  console.error("No Chromium found. Set CHROMIUM_PATH.");
  process.exit(2);
}

const browser = await chromium.launch({ executablePath: findChromium() });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${base}/login?next=${encodeURIComponent(route)}`);
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15000 });
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: out, fullPage: true });

  console.log(`Saved ${out} for ${page.url()}`);
  for (const e of errors) console.log(`console error: ${e}`);
} finally {
  await browser.close();
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../public/halloween-theme.css", import.meta.url), "utf8");

function declarations(selector) {
  const anchor = selector + " {";
  const start = css.indexOf(anchor);
  if (start < 0) throw Error("Missing CSS selector: " + selector);
  return css.slice(start + anchor.length, css.indexOf("}", start));
}

test("Halloween base alone is dimmed, not riders or entire scene", () => {
  const base = declarations("body.season-halloween .app-shell::before");
  assert.match(base, /filter:\s*brightness\(\.81\)/);
  assert.match(base, /background:\s*var\(--season-base/);
  assert.doesNotMatch(declarations("body.season-halloween .app-shell"), /filter:/);
  assert.doesNotMatch(declarations("body.season-halloween .race-stage"), /filter:/);
});

test("Glow masks get distinct low and high states; pointer events stay disabled", () => {
  const pumpkin = declarations("body.season-halloween .season-glow-pumpkins");
  const lamp = declarations("body.season-halloween .season-glow-lamps");
  assert.match(pumpkin, /mix-blend-mode:\s*screen/);
  assert.match(lamp, /mix-blend-mode:\s*screen/);
  assert.match(pumpkin, /filter:\s*brightness\(1\.7\)/);
  assert.match(lamp, /filter:\s*brightness\(1\.5\)/);
  assert.match(css, /@keyframes halloweenPumpkinBreath\s*\{\s*from\s*\{\s*opacity:\s*\.03;\s*\}\s*to\s*\{\s*opacity:\s*\.92;/);
  assert.match(css, /@keyframes halloweenLampBreath\s*\{\s*from\s*\{\s*opacity:\s*\.04;\s*\}\s*to\s*\{\s*opacity:\s*\.67;/);
  assert.match(declarations("body.season-halloween .season-layer-host"), /pointer-events:\s*none\s*!important/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

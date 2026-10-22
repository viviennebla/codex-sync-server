import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// These prototypes were expressly rejected/retired. Do not conflate them
// with live vehicle SVGs, which may still be used by the runtime or exporter.
const retired = [
  "public/riders/presets/helmet-commuter/head.svg",
  "public/riders/presets/helmet-commuter/body.svg",
  "public/riders/presets/helmet-commuter/backpack.svg",
  "public/riders/presets/helmet-commuter/bike.svg",
  "docs/assets/denglema/helmet-commuter-v01-design-board.svg",
  "public/themes/halloween/office-stage-halloween.svg",
];

test("retired SVG prototypes remain absent from the repository", async () => {
  for (const path of retired) {
    await assert.rejects(
      access(join(root, path)),
      { code: "ENOENT" },
      path + " must not be reintroduced as a production asset",
    );
  }
});

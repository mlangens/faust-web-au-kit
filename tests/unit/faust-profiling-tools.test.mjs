import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyFaustWasmControlIndexes } from "../../tools/lib/faust-profiling-tools.mjs";

test("Faust WASM profiling merges WAST control indexes into JSON metadata", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "fwak-wast-indexes."));
  try {
    const uiJsonPath = path.join(scratch, "main.ui.json");
    const wastPath = path.join(scratch, "main.wast");
    const uiJson = {
      ui: [
        {
          type: "vgroup",
          label: "Demo",
          items: [
            {
              type: "hslider",
              label: "Input",
              address: "/Demo/Input"
            },
            {
              type: "checkbox",
              label: "Power",
              address: "/Demo/Power"
            }
          ]
        }
      ]
    };
    const embedded = {
      ui: [
        {
          type: "vgroup",
          label: "Demo",
          items: [
            {
              type: "hslider",
              label: "Input",
              address: "/Demo/Input",
              index: 16
            },
            {
              type: "checkbox",
              label: "Power",
              address: "/Demo/Power",
              index: 0
            }
          ]
        }
      ]
    };
    fs.writeFileSync(uiJsonPath, `${JSON.stringify(uiJson)}\n`);
    fs.writeFileSync(wastPath, `(module\n  (data (i32.const 0) ${JSON.stringify(JSON.stringify(embedded))})\n)\n`);

    const merged = applyFaustWasmControlIndexes(uiJson, uiJsonPath);
    assert.equal(merged.ui[0].items[0].index, 16);
    assert.equal(merged.ui[0].items[1].index, 0);
    assert.equal(uiJson.ui[0].items[0].index, undefined);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

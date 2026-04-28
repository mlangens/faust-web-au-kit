import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..", "..");

test("profiling Audio Unit host source and compiler flags stay headless", () => {
  const source = fs.readFileSync(path.join(root, "src", "profile_au_host.m"), "utf8");
  const profilerTools = fs.readFileSync(path.join(root, "tools", "lib", "uad-plugin-profiler-tools.mjs"), "utf8");

  for (const forbidden of ["Cocoa", "AppKit", "WebKit"]) {
    assert.equal(source.includes(`#import <${forbidden}/`), false);
    assert.equal(profilerTools.includes(`"-framework",\n      "${forbidden}"`), false);
  }
});

test("AU GUI staging requires an explicit allow-gui flag", () => {
  const result = spawnSync(
    process.execPath,
    ["tools/stage-au-plugin.mjs", "--name", "Apple: AULowpass", "--exact", "--seconds", "0.1"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--allow-gui/u);
  assert.match(result.stderr, /Profiling commands remain headless/u);
});

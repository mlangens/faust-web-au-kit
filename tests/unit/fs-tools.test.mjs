import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createTempDir, removePathSync, replaceFileAtomically, writeFileAtomically } from "../../tools/lib/fs-tools.mjs";

test("writeFileAtomically creates parent directories and replaces existing contents", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fwak-fs-tools-"));

  try {
    const targetPath = path.join(root, "nested", "artifacts", "ui_schema.json");
    writeFileAtomically(targetPath, "{\"version\":1}\n");
    assert.equal(fs.readFileSync(targetPath, "utf8"), "{\"version\":1}\n");

    writeFileAtomically(targetPath, "{\"version\":2}\n");
    assert.equal(fs.readFileSync(targetPath, "utf8"), "{\"version\":2}\n");
    assert.deepEqual(
      fs.readdirSync(path.dirname(targetPath)).filter((entry) => entry.endsWith(".tmp")),
      []
    );
  } finally {
    removePathSync(root);
  }
});

test("replaceFileAtomically publishes a staged file without mutating the source", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fwak-fs-tools-"));

  try {
    const sourcePath = path.join(root, "stage", "LimiterLab.c");
    const destinationPath = path.join(root, "generated", "targets", "LimiterLab.c");
    const nextContents = "next export contents\n";

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, nextContents);
    writeFileAtomically(destinationPath, "stale export contents\n");

    replaceFileAtomically(sourcePath, destinationPath);

    assert.equal(fs.readFileSync(destinationPath, "utf8"), nextContents);
    assert.equal(fs.readFileSync(sourcePath, "utf8"), nextContents);
  } finally {
    removePathSync(root);
  }
});

test("createTempDir and removePathSync round-trip scratch directories", () => {
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), "fwak-fs-tools-"));

  try {
    const tempDir = createTempDir(parentDir, ".generated.export-");
    assert.equal(fs.existsSync(tempDir), true);
    removePathSync(tempDir);
    assert.equal(fs.existsSync(tempDir), false);
  } finally {
    removePathSync(parentDir);
  }
});

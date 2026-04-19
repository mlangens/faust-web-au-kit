import fs from "node:fs";
import path from "node:path";

function createTempDir(parentDir, prefix) {
  fs.mkdirSync(parentDir, { recursive: true });
  return fs.mkdtempSync(path.join(parentDir, prefix));
}

function removePathSync(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function siblingTempPath(destination) {
  const directory = path.dirname(destination);
  const basename = path.basename(destination);
  return path.join(directory, `.${basename}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
}

function writeFileAtomically(destination, contents) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporaryPath = siblingTempPath(destination);
  fs.writeFileSync(temporaryPath, contents);
  fs.renameSync(temporaryPath, destination);
}

function replaceFileAtomically(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporaryPath = siblingTempPath(destination);
  fs.copyFileSync(source, temporaryPath);

  const sourceMode = fs.statSync(source).mode;
  fs.chmodSync(temporaryPath, sourceMode);
  fs.renameSync(temporaryPath, destination);
}

export { createTempDir, removePathSync, replaceFileAtomically, writeFileAtomically };

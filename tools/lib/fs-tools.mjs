// @ts-check

import fs from "node:fs";
import path from "node:path";

/**
 * @template T
 * @param {string} filePath
 * @returns {T}
 */
function readJsonFileSync(filePath) {
  return /** @type {T} */ (JSON.parse(fs.readFileSync(filePath, "utf8")));
}

/**
 * @param {string} parentDir
 * @param {string} prefix
 * @returns {string}
 */
function createTempDir(parentDir, prefix) {
  fs.mkdirSync(parentDir, { recursive: true });
  return fs.mkdtempSync(path.join(parentDir, prefix));
}

/**
 * @param {string} targetPath
 * @returns {void}
 */
function removePathSync(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

/**
 * @param {string} destination
 * @returns {string}
 */
function siblingTempPath(destination) {
  const directory = path.dirname(destination);
  const basename = path.basename(destination);
  return path.join(directory, `.${basename}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
}

/**
 * @param {string} destination
 * @param {string | NodeJS.ArrayBufferView} contents
 * @returns {void}
 */
function writeFileAtomically(destination, contents) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporaryPath = siblingTempPath(destination);
  fs.writeFileSync(temporaryPath, contents);
  fs.renameSync(temporaryPath, destination);
}

/**
 * @param {string} source
 * @param {string} destination
 * @returns {void}
 */
function replaceFileAtomically(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporaryPath = siblingTempPath(destination);
  fs.copyFileSync(source, temporaryPath);

  const sourceMode = fs.statSync(source).mode;
  fs.chmodSync(temporaryPath, sourceMode);
  fs.renameSync(temporaryPath, destination);
}

export { createTempDir, readJsonFileSync, removePathSync, replaceFileAtomically, writeFileAtomically };

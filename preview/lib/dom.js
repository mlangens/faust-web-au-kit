// @ts-check

/**
 * @typedef {import("../../types/framework").PreviewRoots} PreviewRoots
 */

/**
 * @param {Document} doc
 * @param {string} selector
 * @returns {HTMLElement}
 */
function requireElement(doc, selector) {
  const element = doc.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing preview shell element: ${selector}`);
  }
  return element;
}

/**
 * @param {Document} [doc=document]
 * @returns {PreviewRoots}
 */
function getPreviewRoots(doc = document) {
  return {
    eyebrow: requireElement(doc, "#heroEyebrow"),
    title: requireElement(doc, "#productTitle"),
    description: requireElement(doc, "#projectDescription"),
    status: requireElement(doc, "#projectStatus"),
    nav: requireElement(doc, "#previewNav"),
    surfacePanel: requireElement(doc, "#surfacePanel"),
    surfacesTitle: requireElement(doc, "#surfacesTitle"),
    surfacesDescription: requireElement(doc, "#surfacesDescription"),
    surfaces: requireElement(doc, "#surfaces"),
    controlsTitle: requireElement(doc, "#controlsTitle"),
    controlsDescription: requireElement(doc, "#controlsDescription"),
    controls: requireElement(doc, "#controls"),
    metersTitle: requireElement(doc, "#metersTitle"),
    metersDescription: requireElement(doc, "#metersDescription"),
    meters: requireElement(doc, "#meters"),
    benchmarksTitle: requireElement(doc, "#benchmarksTitle"),
    benchmarksDescription: requireElement(doc, "#benchmarksDescription"),
    benchmarks: requireElement(doc, "#benchmarks")
  };
}

export { getPreviewRoots };

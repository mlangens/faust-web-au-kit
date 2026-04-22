function getPreviewRoots(doc = document) {
  return {
    eyebrow: doc.querySelector("#heroEyebrow"),
    title: doc.querySelector("#productTitle"),
    description: doc.querySelector("#projectDescription"),
    status: doc.querySelector("#projectStatus"),
    nav: doc.querySelector("#previewNav"),
    surfacePanel: doc.querySelector("#surfacePanel"),
    surfacesTitle: doc.querySelector("#surfacesTitle"),
    surfacesDescription: doc.querySelector("#surfacesDescription"),
    surfaces: doc.querySelector("#surfaces"),
    controlsTitle: doc.querySelector("#controlsTitle"),
    controlsDescription: doc.querySelector("#controlsDescription"),
    controls: doc.querySelector("#controls"),
    metersTitle: doc.querySelector("#metersTitle"),
    metersDescription: doc.querySelector("#metersDescription"),
    meters: doc.querySelector("#meters"),
    benchmarksTitle: doc.querySelector("#benchmarksTitle"),
    benchmarksDescription: doc.querySelector("#benchmarksDescription"),
    benchmarks: doc.querySelector("#benchmarks")
  };
}

export { getPreviewRoots };

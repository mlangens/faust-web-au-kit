import { bootstrapPreview } from "./lib/bootstrap.js";
import { getPreviewRoots } from "./lib/dom.js";
import { renderPreviewError } from "./lib/renderers.js";

bootstrapPreview().catch((error) => {
  renderPreviewError(getPreviewRoots(document), error.message);
  console.error(error);
});

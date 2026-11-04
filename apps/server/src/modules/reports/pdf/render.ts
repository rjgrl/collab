import path from "node:path";
import pdfmake from "pdfmake";
import roboto from "pdfmake/fonts/Roboto.js";

// Roboto ships with pdfmake and covers Latin-extended names (ñ, é, ü); the PDF base-14
// fonts do not embed glyphs outside WinAnsi.
const fontDirectory = path.dirname(roboto.Roboto!.normal!);
pdfmake.setFonts(roboto);
// Templates never reference images or URLs; refuse any network fetch and any file
// outside the bundled font directory, so user data in a document cannot pull resources.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((file) => {
  const relative = path.relative(fontDirectory, path.resolve(file));
  return !relative.startsWith("..") && !path.isAbsolute(relative);
});

export async function renderPdf(docDefinition: object): Promise<Buffer> {
  return pdfmake.createPdf(docDefinition).getBuffer();
}

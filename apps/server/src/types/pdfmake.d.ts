// pdfmake 0.3 ships no type definitions; this covers only what reports/pdf/render.ts uses,
// checked against node_modules/pdfmake/js/base.js and OutputDocument.js (0.3.12).
declare module "pdfmake" {
  const pdfmake: {
    setFonts(fonts: Record<string, Record<string, string>>): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    createPdf(docDefinition: object, options?: object): { getBuffer(): Promise<Buffer> };
  };
  export default pdfmake;
}
declare module "pdfmake/fonts/Roboto.js" {
  const fonts: Record<string, Record<string, string>>;
  export default fonts;
}

// pdf.js ships types for the package root only; its browser build has the same API.
declare module 'pdfjs-dist/build/pdf.mjs' {
  export * from 'pdfjs-dist';
}

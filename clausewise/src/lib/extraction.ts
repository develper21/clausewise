import { getDocument as openPdf, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import mammoth from "mammoth";
import type { DocumentPage } from "./contracts";

GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs"),
).href;

export async function extractPdf(bytes: Buffer): Promise<DocumentPage[]> {
  const pdf = await openPdf({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise;
  const pages: DocumentPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
    pages.push({ pageNumber, text });
  }

  return pages;
}

export async function extractDocx(bytes: Buffer): Promise<DocumentPage[]> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  const paragraphs = result.value
    .split(/\n+/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const pages: DocumentPage[] = [];
  let pageText = "";
  let pageNumber = 1;

  for (const paragraph of paragraphs) {
    if (pageText.length + paragraph.length > 2600 && pageText) {
      pages.push({ pageNumber, text: pageText });
      pageNumber += 1;
      pageText = "";
    }
    pageText = pageText ? `${pageText}\n\n${paragraph}` : paragraph;
  }
  if (pageText) pages.push({ pageNumber, text: pageText });

  return pages;
}
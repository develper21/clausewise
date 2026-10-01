import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET() {
  const worker = await readFile(path.join(process.cwd(), "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"));
  return new Response(new Uint8Array(worker), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
import { readFile } from "node:fs/promises";
import { getDocument, getStoredFilePath } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/documents/[documentId]/file">,
) {
  const { documentId } = await context.params;
  const document = await getDocument(documentId);
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  const file = await readFile(getStoredFilePath(document));
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": document.contentType,
      "Content-Disposition": `inline; filename="${document.name.replace(/["\\\r\n]/gu, "_")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
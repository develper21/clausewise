import { deleteDocument, getDocument } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/documents/[documentId]">,
) {
  const { documentId } = await context.params;
  const document = await getDocument(documentId);
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  return Response.json(document);
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/documents/[documentId]">,
) {
  const { documentId } = await context.params;
  const deleted = await deleteDocument(documentId);
  if (!deleted) return Response.json({ error: "Document not found." }, { status: 404 });
  return new Response(null, { status: 204 });
}
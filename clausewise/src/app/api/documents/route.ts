import { extractDocx, extractPdf } from "@/lib/extraction";
import { listDocuments, saveDocument } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const documents = await listDocuments();
  return Response.json(documents);
}

export async function POST(request: Request) {
  let upload: FormData;
  try {
    upload = await request.formData();
  } catch {
    return Response.json({ error: "Choose a PDF or DOCX file to upload." }, { status: 400 });
  }

  const file = upload.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Choose a PDF or DOCX file to upload." }, { status: 400 });
  }

  const extension = file.name.toLocaleLowerCase().split(".").at(-1);
  if (extension !== "pdf" && extension !== "docx") {
    return Response.json({ error: "Unsupported file type. Upload a PDF or DOCX document." }, { status: 415 });
  }
  if (file.size === 0) return Response.json({ error: "This file is empty." }, { status: 400 });
  if (file.size > 45 * 1024 * 1024) {
    return Response.json({ error: "Files must be smaller than 45 MB." }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf = extension === "pdf" && bytes.subarray(0, 5).toString() === "%PDF-";
  const isDocx = extension === "docx" && bytes.subarray(0, 2).toString() === "PK";
  if (!isPdf && !isDocx) {
    return Response.json({ error: "The file contents do not match its PDF or DOCX extension." }, { status: 415 });
  }

  try {
    const pages = extension === "pdf" ? await extractPdf(bytes) : await extractDocx(bytes);
    const readableText = pages.map((page) => page.text).join(" ").trim();
    if (readableText.length < 35) {
      return Response.json(
        { error: "No readable text was found. This may be a scanned PDF; OCR is not enabled, so it was not saved." },
        { status: 422 },
      );
    }

    const document = await saveDocument({
      name: file.name,
      extension,
      contentType: file.type || (extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      size: file.size,
      bytes,
      pages,
    });
    return Response.json(document, { status: 201 });
  } catch (error) {
    console.error("Document extraction failed", error);
    return Response.json({ error: "This document could not be processed. Check that it is a valid, unencrypted PDF or DOCX." }, { status: 422 });
  }
}
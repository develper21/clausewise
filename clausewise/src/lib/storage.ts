import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { DocumentPage } from "./contracts";

export type Citation = {
  documentId: string;
  documentName: string;
  quote: string;
  pageStart: number;
  pageEnd: number;
  startOffset: number;
  endOffset: number;
  verified: true;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  createdAt: string;
};

export type StoredDocument = {
  id: string;
  name: string;
  extension: "pdf" | "docx";
  contentType: string;
  size: number;
  uploadedAt: string;
  pages: DocumentPage[];
  messages: ChatMessage[];
};

type DocumentIndex = { documents: StoredDocument[] };

const dataDirectory = path.join(process.cwd(), ".data");
const uploadDirectory = path.join(dataDirectory, "uploads");
const indexPath = path.join(dataDirectory, "documents.json");
let writeQueue = Promise.resolve();

async function ensureStorage(): Promise<void> {
  await mkdir(uploadDirectory, { recursive: true });
}

async function readIndex(): Promise<DocumentIndex> {
  await ensureStorage();
  try {
    return JSON.parse(await readFile(indexPath, "utf8")) as DocumentIndex;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { documents: [] };
    throw error;
  }
}

async function writeIndex(index: DocumentIndex): Promise<void> {
  const temporaryPath = `${indexPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(index), "utf8");
  await rename(temporaryPath, indexPath);
}

async function updateIndex(
  update: (index: DocumentIndex) => DocumentIndex,
): Promise<void> {
  const current = writeQueue.then(async () => {
    const index = await readIndex();
    await writeIndex(update(index));
  });
  writeQueue = current.catch(() => undefined);
  await current;
}

export async function listDocuments(): Promise<StoredDocument[]> {
  const index = await readIndex();
  return index.documents.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

export async function getDocument(documentId: string): Promise<StoredDocument | undefined> {
  return (await readIndex()).documents.find((document) => document.id === documentId);
}

export async function saveDocument(input: {
  name: string;
  extension: "pdf" | "docx";
  contentType: string;
  size: number;
  bytes: Buffer;
  pages: DocumentPage[];
}): Promise<StoredDocument> {
  await ensureStorage();
  const document: StoredDocument = {
    id: randomUUID(),
    name: path.basename(input.name).replace(/[\\/\u0000-\u001f]/gu, "_").slice(0, 180),
    extension: input.extension,
    contentType: input.contentType,
    size: input.size,
    uploadedAt: new Date().toISOString(),
    pages: input.pages,
    messages: [],
  };
  await writeFile(path.join(uploadDirectory, `${document.id}.${document.extension}`), input.bytes);
  try {
    await updateIndex((index) => ({ documents: [...index.documents, document] }));
  } catch (error) {
    await rm(path.join(uploadDirectory, `${document.id}.${document.extension}`), { force: true });
    throw error;
  }
  return document;
}

export function getStoredFilePath(document: StoredDocument): string {
  return path.join(uploadDirectory, `${document.id}.${document.extension}`);
}

export async function deleteDocument(documentId: string): Promise<boolean> {
  const document = await getDocument(documentId);
  if (!document) return false;
  await updateIndex((index) => ({
    documents: index.documents.filter((item) => item.id !== documentId),
  }));
  await rm(getStoredFilePath(document), { force: true });
  return true;
}

export async function appendMessages(
  documentIds: string[],
  messages: ChatMessage[],
): Promise<void> {
  const selectedIds = new Set(documentIds);
  await updateIndex((index) => ({
    documents: index.documents.map((document) =>
      selectedIds.has(document.id)
        ? { ...document, messages: [...document.messages, ...messages] }
        : document,
    ),
  }));
}

export function createMessage(
  role: ChatMessage["role"],
  content: string,
  citations: Citation[] = [],
): ChatMessage {
  return {
    id: randomUUID(),
    role,
    content,
    citations,
    createdAt: new Date().toISOString(),
  };
}
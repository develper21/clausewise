# Architecture

## Runtime and stack

- Next.js App Router with React and TypeScript; Node.js is required for file and PDF processing routes.
- `pdfjs-dist` extracts PDF page text and renders PDF pages; `mammoth` extracts DOCX text.
- `lucide-react` supplies interface icons. Vitest runs the contract logic tests.
- The Dockerfile builds the Next.js app in a Node 22 Alpine image and serves it on port 3000.

## Main areas

| Path | Responsibility |
| --- | --- |
| `clausewise/src/app/workspace.tsx` | Client workspace: library, upload, conversation, research progress, citation navigation, and comparison views. |
| `clausewise/src/app/api/documents/route.ts` | Lists and accepts uploaded documents; validates extension, signatures, size, and readable extracted text. |
| `clausewise/src/app/api/documents/[documentId]/route.ts` | Reads or deletes a document and its associated stored content. |
| `clausewise/src/app/api/documents/[documentId]/file/route.ts` | Serves the original stored file. |
| `clausewise/src/app/api/chat/route.ts` | Validates chat input, retrieves evidence, streams answer/progress events, verifies citations, and saves messages. |
| `clausewise/src/app/api/compare/route.ts` | Compares two documents and optionally requests a model-generated summary. |
| `clausewise/src/app/api/pdf-worker/route.ts` and `pdf-page.tsx` | Make the PDF.js worker available and render selected source pages. |
| `clausewise/src/lib/extraction.ts` | Converts PDF pages or DOCX paragraphs to page-like text records. DOCX sections are approximate text chunks, not original page numbers. |
| `clausewise/src/lib/contracts.ts` | Text normalization, quote location, chunking, lexical ranking, and clause-level comparison. |
| `clausewise/src/lib/research.ts` | Evidence retrieval, source quote verification, local fallback answers, provider configuration, and research tool definitions/validation. |
| `clausewise/src/lib/storage.ts` | Local file persistence and JSON document index under `.data/`; serializes index updates within the process. |

## Data flow

1. The browser submits a PDF/DOCX multipart upload to `POST /api/documents`.
2. The server checks the extension, file signature, size, and extracted text, then stores the original file and extracted pages.
3. Chat selects up to four saved documents. The server chunks and searches all extracted pages locally, ranks passages, and either builds a local evidence answer or sends bounded evidence to the configured OpenAI-compatible chat-completions endpoint.
4. In research mode, the provider may call validated document tools for up to four rounds. Tool results are treated as untrusted source data.
5. The server independently locates citation text in the selected source documents and emits answer deltas, progress, and verified citations as server-sent events.
6. Clicking a citation selects its document and navigates to its source page/section; PDF display uses PDF.js and DOCX display uses extracted text.
7. Comparison splits extracted text into paragraphs, greedily pairs similar clauses, labels unmatched paragraphs as additions/removals, and ranks changes using topic heuristics.

## Persistence and deployment assumptions

The document index is `.data/documents.json`; original uploads are in `.data/uploads/`. Writes use temporary files followed by rename, with an in-process queue for index updates. This is suitable for a local, single-user demo but is not a multi-instance database or a substitute for backups. The deployment must provide writable persistent storage for `.data`; ephemeral serverless filesystems will lose data. The Dockerfile does not currently declare a persistent volume.

## Important boundaries

- Quote verification establishes that normalized wording exists in extracted text; it does not validate legal meaning or guarantee perfect PDF highlight geometry.
- Retrieval ranks lexical matches. A full scan reduces the risk of ignoring later pages, but a poor lexical match can still miss semantically relevant text.
- Model output is not trusted as source evidence. Quotes are located and offsets/pages are computed by the application.
- No authentication or tenant isolation is present. Do not expose an instance containing sensitive contracts publicly without adding access controls and appropriate storage protections.
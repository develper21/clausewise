# Product Requirements Document

## Product

Clausewise is a single-user workspace for reviewing contracts. Users upload PDF or DOCX files, ask questions grounded in extracted contract text, inspect verified source citations, and compare two document versions.

## Users and problem

The intended user needs to understand obligations and changes in contract language without losing the ability to inspect the source. Answers must not present generated wording as an authentic quotation or treat missing search results as proof that a clause is absent.

## Product goals

- Accept readable PDF and DOCX contracts and explain rejected or unreadable files.
- Make the document, its extracted text, and conversation history easy to revisit.
- Ground answers in selected documents and make verified quotes clickable back to their source.
- Support questions across several documents and clause-level version comparisons.
- Offer agentic document research with visible progress and a bounded tool loop.
- Be candid about limitations; Clausewise is not legal advice.

## Requirements and current status

| Requirement | Current implementation |
| --- | --- |
| PDF/DOCX upload, validation, extraction, and library management | Implemented; files over 45 MB, invalid formats, and files with too little readable text are rejected. |
| Chat with streaming, cancellation, and per-document history | Implemented through a server-sent event stream; a stopped answer is persisted when the request reaches finalization. |
| Source-verified quotations | Implemented: normalized quote matching searches extracted text and derives page/offset positions locally. Only located passages are shown as verified citations. |
| Large-document retrieval | Implemented with overlapping chunks and a full local scan before ranked passages are sent to a configured model. This is lexical retrieval, not a guarantee of semantic recall. |
| Citation navigation/highlighting | Implemented for extracted source text and PDF page rendering; visual alignment can be imperfect when PDF extraction geometry differs from rendered layout. |
| Multi-document questions | Implemented for up to four selected documents; citations retain their originating document identity. |
| Clause comparison | Implemented using paragraph token similarity and significance heuristics; an optional configured model summarizes the changes. This is not a legal-equivalence determination. |
| Part C, Option 2: agentic research | Implemented when an AI provider is configured: search, read a section, or list likely clause headings for up to four rounds. Without a provider, the app uses local evidence mode and does not execute an agent loop. |
| OCR, authentication, encrypted durable storage | Not implemented. Scanned documents without readable text are rejected; the workspace is single-user and local-file-backed. |

## Constraints and acceptance criteria

- Supported formats are PDF and DOCX; the upload limit is 45 MB.
- AI configuration comes from `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`; never commit secrets.
- A quote is marked verified only after matching the complete extracted source text. AI-supplied page numbers and offsets are not trusted.
- If relevant evidence is not found, the answer must not claim that the clause is absent.
- Comparison results must be described as heuristic unless a configured provider supplies a summary; neither output is legal advice.
- The product needs to remain usable in local demo mode without an AI key.

## Out of scope

Multi-user accounts, OCR, tracked-change DOCX redlining, embeddings, export, Arabic/RTL processing, and production-grade encrypted object storage are not part of the current implementation.
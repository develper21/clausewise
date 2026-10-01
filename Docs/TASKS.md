# Tasks

## Current baseline

- [x] Upload PDF/DOCX and reject unsupported, mismatched, oversized, empty, or unreadable input.
- [x] Extract document text and maintain a local document library with open/delete actions.
- [x] Ask questions with streamed output, cancellation, and per-document chat history.
- [x] Verify quotes against normalized extracted text and navigate to the source.
- [x] Retrieve evidence across all extracted pages using overlapping chunks and lexical ranking.
- [x] Ask across up to four documents with document-specific citations.
- [x] Compare clause/paragraph changes and filter by heuristic significance.
- [x] Implement Part C Option 2 research tools with validation, visible progress, and a four-round cap when a provider is configured.
- [x] Cover core quote, retrieval, comparison, fallback answer, and malformed-tool behaviors in Vitest.

## Next, prioritized

- [ ] Run a manual end-to-end test with representative long PDFs and DOCX files, including repeated quotes, page-crossing citations, malformed files, and a stopped response.
- [ ] Exercise agentic research against a configured provider, recording behavior for tool errors, provider failures, and adversarial document text.
- [ ] Add OCR or clearly maintain the current scanned-PDF rejection; evaluate extraction quality for tables and unusual PDF layouts.
- [ ] Replace JSON/local-file persistence for production use with durable, access-controlled storage; add authentication before exposing contract data to multiple users or the public internet.
- [ ] Add automated API tests for upload validation, history persistence, streamed cancellation, and comparison edge cases.
- [ ] Validate PDF highlight alignment on documents with multiple columns, repeated passages, and cross-page quotations.
- [ ] Deploy to a host with a persistent writable volume and verify restart behavior and backups.
- [ ] Record the requested 3-5 minute demo and publish working repository/deployment links before submission.

## Later / out of scope

- [ ] Semantic/embedding retrieval and evaluation against a representative contract set.
- [ ] Arabic extraction and right-to-left layout.
- [ ] DOCX tracked-change redlining, export, anonymization, and background job recovery.

Do not mark a task complete based only on UI presence; verify the behavior described by its acceptance criteria.
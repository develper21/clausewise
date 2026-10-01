# Project Memory

## Snapshot

- Product: Clausewise, a single-user contract analysis workspace built with Next.js, React, and TypeScript.
- Repository layout: app source and package scripts live in `clausewise/`; this documentation and the hiring brief live in `Docs/`.
- Part C choice: Option 2, agentic document research. The implementation exposes `search_document`, `get_section`, and `list_clauses`, with a maximum of four model/tool rounds.
- No AI key is required for local evidence mode. Configure `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL` to use the OpenAI-compatible provider path.

## Key invariants

- Supported uploads are PDF and DOCX, up to 45 MB. OCR is not enabled.
- Uploaded originals, extracted pages, and chat messages are stored under `clausewise/.data/` at runtime; this directory is local data, not source control content.
- Quote matching normalizes Unicode compatibility forms and whitespace, searches complete extracted text, and computes page/offset coordinates in the application.
- Citation verification confirms extracted-text presence only. It does not guarantee semantic correctness or perfect visual placement.
- Large documents are chunked with overlap and searched locally across all chunks; retrieval uses lexical scoring, not embeddings.
- Comparison is paragraph-level matching using token overlap and topic-based significance; summaries may be heuristic.
- There is no login, tenant isolation, OCR, or production-grade encrypted object storage.

## Useful commands

Run from `clausewise/`:

```bash
npm run dev
npm test
npm run lint
npm run build
```

## Known next work

See `Docs/TASKS.md` for the prioritized verification and delivery list. Highest-risk areas are external-provider research behavior, durable storage/access control, scanned-document OCR, and PDF visual highlight alignment.
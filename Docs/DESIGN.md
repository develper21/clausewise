# Design Notes

## Product feel

Clausewise is a quiet, focused contract workbench. The interface prioritizes source inspection and repeated review over promotional content: a document library sits beside a conversation, with the source document visible as a persistent companion. Comparison is a separate view focused on before/after clauses and significance.

## Visual system in the current app

- Canvas: warm off-white (`--paper: #fbfcfa`) with a pale green-gray sidebar (`--sidebar: #f4f6f2`) and white working surfaces.
- Text: deep green-black ink (`--ink: #1b2823`) with muted gray-green secondary text.
- Primary action and brand: forest green (`--green: #176a4c`); research activity uses restrained olive accents.
- Source citations: serif quote text and a soft yellow highlight (`--highlight: #f7e89a`) to distinguish evidence from assistant prose.
- Typography: Geist sans for interface text and Georgia/Times for the wordmark, editorial headings, and quoted source text.
- Geometry: compact controls, mostly 3-5 px radii, fine borders, restrained shadows, and icon-led actions with accessible labels.

## Layout and interaction

- Desktop: a fixed document/navigation sidebar, central chat or comparison workspace, and source pane.
- Narrow screens: the source pane and document selection use dedicated mobile controls; preserve access to citation navigation and upload status.
- Upload states: show processing progress and specific rejection errors rather than silently accepting empty files.
- Chat states: distinguish empty library, selected document, streaming answer, research activity, errors, cancellation, and verified citations.
- Comparison states: show document selectors, loading, empty setup, significance filters, and before/after text.
- Citations are interactive controls; opening one switches to its document and source location. Keyboard focus must remain visible.

## Design constraints

- Keep the source passage visually primary when a user opens a citation.
- Do not use a green status alone to imply legal correctness; it means only that text was located in the extracted source.
- Keep dense review information scannable without nesting decorative cards.
- Maintain legible text, non-overlapping controls, and workable touch targets at mobile widths.
- Treat the existing tokens in `clausewise/src/app/globals.css` as the source of truth when changing the visual system.
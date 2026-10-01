import { describe, expect, it } from "vitest";
import { buildChunks, compareClauses, locateQuote, searchChunks } from "./contracts";
import { executeResearchTool, fallbackAnswer, retrieveEvidence, verifyEvidenceQuotes } from "./research";
import type { StoredDocument } from "./storage";

describe("verified source quotes", () => {
  it("locates quotes across extraction whitespace and page breaks", () => {
    const result = locateQuote(
      [
        { pageNumber: 4, text: "The supplier shall maintain" },
        { pageNumber: 5, text: "commercially reasonable security." },
      ],
      "The supplier   shall maintain commercially\nreasonable security.",
    );

    expect(result).toMatchObject({ pageStart: 4, pageEnd: 5 });
    expect(result?.quote).toBe("The supplier shall maintain\n\ncommercially reasonable security.");
  });

  it("rejects text that is not present in the source", () => {
    expect(locateQuote([{ pageNumber: 1, text: "The agreement renews yearly." }], "The agreement renews monthly.")).toBeNull();
  });

  it("maps a repeated quote to the evidence page when supplied", () => {
    const pages = [
      { pageNumber: 2, text: "The monthly fee is five units." },
      { pageNumber: 9, text: "The monthly fee is five units." },
    ];
    expect(locateQuote(pages, "The monthly fee is five units.", 9)?.pageStart).toBe(9);
  });

  it("maps a repeated quote to its nearest source offset", () => {
    const text = "The monthly fee is five units. Other terms apply. The monthly fee is five units.";
    const result = locateQuote([{ pageNumber: 1, text }], "The monthly fee is five units.", 1, 52);
    expect(result?.startOffset).toBe(text.lastIndexOf("The monthly"));
  });
});

describe("large-document retrieval", () => {
  it("indexes later pages and returns matching chunks", () => {
    const pages = [
      { pageNumber: 1, text: "General introduction to the agreement. ".repeat(80) },
      { pageNumber: 149, text: "The liability cap is AED 100,000 for direct damages." },
    ];
    const chunks = buildChunks(pages);

    expect(chunks.length).toBeGreaterThan(2);
    expect(searchChunks(chunks, "liability cap direct damages")[0]?.pageNumber).toBe(149);
  });
});

describe("clause-level comparison", () => {
  it("surfaces a material liability cap change as high significance", () => {
    const changes = compareClauses(
      "Limitation of liability. Each party's aggregate liability is capped at AED 100,000 for direct damages.",
      "Limitation of liability. Each party's aggregate liability is capped at AED 1,000,000 for direct damages.",
    );

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ title: "Limitation of liability", significance: "high", status: "changed" });
  });
});

describe("local evidence answers", () => {
  it("answers a simple question using a source sentence", () => {
    const document: StoredDocument = {
      id: "contract-1",
      name: "Assignment.pdf",
      extension: "pdf",
      contentType: "application/pdf",
      size: 100,
      uploadedAt: new Date(0).toISOString(),
      pages: [{ pageNumber: 1, text: "Deadline: 3 days from the day you receive this assignment." }],
      messages: [],
    };
    const evidence = retrieveEvidence([document], "What is the deadline?");
    const citations = verifyEvidenceQuotes([document], evidence, "What is the deadline?");

    expect(fallbackAnswer("What is the deadline?", [document], evidence)).toContain("Deadline: 3 days from the day you receive this assignment.");
    expect(citations[0]?.quote).toBe("Deadline: 3 days from the day you receive this assignment.");
  });
});

describe("agent research tools", () => {
  it("returns controlled errors for malformed arguments and unknown tools", () => {
    expect(() => executeResearchTool("search_document", "{", [])).not.toThrow();
    expect(executeResearchTool("search_document", "{", []).content).toContain("Invalid tool arguments");
    expect(executeResearchTool("made_up_tool", "{}", []).content).toContain("Unsupported tool");
    expect(executeResearchTool("get_section", '{"document":12,"page_number":"one"}', []).content).toContain("Invalid section request");
  });
});
export type DocumentPage = {
  pageNumber: number;
  text: string;
};

export type TextChunk = {
  id: string;
  pageNumber: number;
  text: string;
  startOffset: number;
  endOffset: number;
};

export type LocatedQuote = {
  quote: string;
  pageStart: number;
  pageEnd: number;
  startOffset: number;
  endOffset: number;
};

export type ClauseChange = {
  id: string;
  title: string;
  status: "changed" | "added" | "removed";
  significance: "high" | "medium" | "low";
  before: string;
  after: string;
};

type NormalizedText = {
  value: string;
  starts: number[];
  ends: number[];
};

function normalizeWithOffsets(text: string): NormalizedText {
  let value = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpace: { start: number; end: number } | undefined;

  for (let offset = 0; offset < text.length; ) {
    const point = text.codePointAt(offset);
    if (point === undefined) break;
    const sourceCharacter = String.fromCodePoint(point);
    const end = offset + sourceCharacter.length;

    if (/\s/u.test(sourceCharacter)) {
      if (value.length > 0 && !pendingSpace) pendingSpace = { start: offset, end };
      else if (pendingSpace) pendingSpace.end = end;
    } else {
      if (pendingSpace) {
        value += " ";
        starts.push(pendingSpace.start);
        ends.push(pendingSpace.end);
        pendingSpace = undefined;
      }

      const normalized = sourceCharacter.normalize("NFKC").toLocaleLowerCase();
      for (const character of normalized) {
        value += character;
        starts.push(offset);
        ends.push(end);
      }
    }

    offset = end;
  }

  return { value, starts, ends };
}

export function locateQuote(
  pages: DocumentPage[],
  quote: string,
  preferredPage?: number,
  preferredOffset?: number,
): LocatedQuote | null {
  const source = pages
    .map((page) => ({ ...page, startOffset: 0 }))
    .reduce<(DocumentPage & { startOffset: number })[]>((result, page) => {
      const previous = result.at(-1);
      page.startOffset = previous
        ? previous.startOffset + previous.text.length + 2
        : 0;
      result.push(page);
      return result;
    }, []);
  const combined = source.map((page) => page.text).join("\n\n");
  const normalizedSource = normalizeWithOffsets(combined);
  const normalizedQuote = normalizeWithOffsets(quote).value;
  if (!normalizedQuote) return null;

  const matches: LocatedQuote[] = [];
  let searchFrom = 0;
  while (searchFrom < normalizedSource.value.length) {
    const matchAt = normalizedSource.value.indexOf(normalizedQuote, searchFrom);
    if (matchAt < 0) break;
    searchFrom = matchAt + 1;

    const startOffset = normalizedSource.starts[matchAt];
    const endOffset = normalizedSource.ends[matchAt + normalizedQuote.length - 1];
    if (startOffset === undefined || endOffset === undefined) continue;
    const startPage = source.find((page) =>
      startOffset >= page.startOffset && startOffset < page.startOffset + page.text.length,
    );
    const endPage = [...source].reverse().find((page) =>
      endOffset > page.startOffset && endOffset <= page.startOffset + page.text.length,
    );
    if (!startPage || !endPage) continue;
    matches.push({
      quote: combined.slice(startOffset, endOffset),
      pageStart: startPage.pageNumber,
      pageEnd: endPage.pageNumber,
      startOffset,
      endOffset,
    });
  }

  const pageMatches = matches.filter((match) =>
    preferredPage !== undefined &&
    preferredPage >= match.pageStart &&
    preferredPage <= match.pageEnd,
  );
  if (preferredOffset !== undefined && pageMatches.length) {
    return pageMatches.sort((left, right) =>
      Math.abs(left.startOffset - preferredOffset) - Math.abs(right.startOffset - preferredOffset),
    )[0];
  }
  return pageMatches[0] ?? matches[0] ?? null;
}

export function buildChunks(
  pages: DocumentPage[],
  maxCharacters = 2400,
  overlap = 240,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let globalOffset = 0;

  for (const page of pages) {
    const text = page.text;
    let start = 0;
    let index = 0;

    while (start < text.length) {
      let end = Math.min(start + maxCharacters, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(" ", end);
        if (boundary > start + Math.floor(maxCharacters * 0.65)) end = boundary;
      }
      const chunkText = text.slice(start, end).trim();
      if (chunkText) {
        const leadingWhitespace = text.slice(start, end).search(/\S/u);
        const actualStart = start + Math.max(leadingWhitespace, 0);
        chunks.push({
          id: `${page.pageNumber}-${index}`,
          pageNumber: page.pageNumber,
          text: chunkText,
          startOffset: globalOffset + actualStart,
          endOffset: globalOffset + actualStart + chunkText.length,
        });
        index += 1;
      }
      if (end >= text.length) break;
      start = Math.max(end - overlap, start + 1);
    }
    globalOffset += text.length + 2;
  }

  return chunks;
}

function tokenize(text: string): string[] {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter(
    (token) => !STOP_WORDS.has(token),
  );
}

const STOP_WORDS = new Set([
  "about", "after", "against", "also", "and", "any", "are", "as", "be", "by",
  "can", "does", "for", "from", "has", "have", "in", "into", "is", "it", "its", "may", "more", "not", "of", "on", "our",
  "shall", "that", "the", "their", "then", "this", "under", "was", "what",
  "when", "where", "which", "who", "will", "with", "would",
]);

export function searchChunks(
  chunks: TextChunk[],
  query: string,
  limit = 6,
): TextChunk[] {
  const terms = [...new Set(tokenize(query))];
  if (!terms.length) return [];

  const documentFrequency = new Map(
    terms.map((term) => [
      term,
      chunks.reduce((count, chunk) => count + (tokenize(chunk.text).includes(term) ? 1 : 0), 0),
    ]),
  );

  return chunks
    .map((chunk) => {
      const tokens = tokenize(chunk.text);
      const counts = new Map<string, number>();
      for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
      const score = terms.reduce((sum, term) => {
        const frequency = counts.get(term) ?? 0;
        if (!frequency) return sum;
        const inverseFrequency = Math.log(1 + chunks.length / (1 + (documentFrequency.get(term) ?? 0)));
        return sum + inverseFrequency * (frequency / (frequency + 1.2));
      }, 0);
      return { chunk, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

function paragraphSimilarity(left: string, right: string): number {
  const leftWords = new Set(tokenize(left));
  const rightWords = new Set(tokenize(right));
  if (!leftWords.size || !rightWords.size) return 0;
  let shared = 0;
  for (const word of leftWords) if (rightWords.has(word)) shared += 1;
  return shared / (leftWords.size + rightWords.size - shared);
}

function splitClauses(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((clause) => clause.replace(/\s+/gu, " ").trim())
    .filter((clause) => clause.length > 28);
}

function significanceFor(text: string): ClauseChange["significance"] {
  if (/liabilit|indemni|damages|cap|penalt|breach|warrant|intellectual property|unlimited|\bAED\b|\$|€|£/iu.test(text)) {
    return "high";
  }
  if (/terminat|renew|notice|payment|fee|confidential|data|privacy|governing law|dispute|jurisdiction/iu.test(text)) {
    return "medium";
  }
  return "low";
}

export function compareClauses(beforeText: string, afterText: string): ClauseChange[] {
  const before = splitClauses(beforeText);
  const after = splitClauses(afterText);
  const candidates = before.flatMap((beforeClause, beforeIndex) =>
    after.map((afterClause, afterIndex) => ({
      beforeIndex,
      afterIndex,
      similarity: paragraphSimilarity(beforeClause, afterClause),
    })),
  );
  const usedBefore = new Set<number>();
  const usedAfter = new Set<number>();
  const changes: ClauseChange[] = [];

  for (const match of candidates.sort((left, right) => right.similarity - left.similarity)) {
    if (match.similarity < 0.18 || usedBefore.has(match.beforeIndex) || usedAfter.has(match.afterIndex)) continue;
    usedBefore.add(match.beforeIndex);
    usedAfter.add(match.afterIndex);
    const oldClause = before[match.beforeIndex];
    const newClause = after[match.afterIndex];
    if (normalizeWithOffsets(oldClause).value === normalizeWithOffsets(newClause).value) continue;
    changes.push({
      id: `changed-${match.beforeIndex}-${match.afterIndex}`,
      title: clauseTitle(oldClause, newClause),
      status: "changed",
      significance: significanceFor(`${oldClause} ${newClause}`),
      before: oldClause,
      after: newClause,
    });
  }

  before.forEach((clause, index) => {
    if (!usedBefore.has(index)) {
      changes.push({
        id: `removed-${index}`,
        title: clauseTitle(clause, ""),
        status: "removed",
        significance: significanceFor(clause),
        before: clause,
        after: "",
      });
    }
  });
  after.forEach((clause, index) => {
    if (!usedAfter.has(index)) {
      changes.push({
        id: `added-${index}`,
        title: clauseTitle("", clause),
        status: "added",
        significance: significanceFor(clause),
        before: "",
        after: clause,
      });
    }
  });

  const order = { high: 0, medium: 1, low: 2 };
  return changes.sort((left, right) => order[left.significance] - order[right.significance]);
}

function clauseTitle(before: string, after: string): string {
  const text = `${before} ${after}`.toLocaleLowerCase();
  const topics: [RegExp, string][] = [
    [/liabilit|cap|damages/, "Limitation of liability"],
    [/indemni/, "Indemnification"],
    [/terminat|renew/, "Term and termination"],
    [/confidential/, "Confidentiality"],
    [/payment|fee|invoice/, "Fees and payment"],
    [/governing law|jurisdiction/, "Governing law"],
    [/data|privacy/, "Data protection"],
    [/intellectual property/, "Intellectual property"],
  ];
  return topics.find(([pattern]) => pattern.test(text))?.[1] ?? "Other provision";
}
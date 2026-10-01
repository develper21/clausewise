import { compareClauses } from "@/lib/contracts";
import { getProviderConfig } from "@/lib/research";
import { getDocument } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { beforeId?: unknown; afterId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.beforeId !== "string" || typeof body.afterId !== "string" || body.beforeId === body.afterId) {
    return Response.json({ error: "Choose two different documents to compare." }, { status: 400 });
  }
  const [before, after] = await Promise.all([getDocument(body.beforeId), getDocument(body.afterId)]);
  if (!before || !after) return Response.json({ error: "One or both documents could not be found." }, { status: 404 });

  const changes = compareClauses(before.pages.map((page) => page.text).join("\n\n"), after.pages.map((page) => page.text).join("\n\n"));
  const high = changes.filter((change) => change.significance === "high").length;
  const medium = changes.filter((change) => change.significance === "medium").length;
  let summary = `${changes.length} clause-level changes detected: ${high} high, ${medium} medium, and ${changes.length - high - medium} low significance. ${high ? "Review the high-significance provisions first; this heuristic flags topics such as liability, indemnity, and monetary caps." : "No high-significance financial or liability wording changes were identified by the clause comparison."}`;

  const config = getProviderConfig();
  if (config && changes.length) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.1,
          messages: [
            { role: "system", content: "Summarize substantive contract differences in plain language using only the clause pairs supplied. Identify monetary or liability implications. If the clauses are unrelated or evidence is insufficient, say so. Do not invent legal outcomes. Return one short paragraph." },
            { role: "user", content: JSON.stringify({ before: before.name, after: after.name, clauseChanges: changes.slice(0, 24) }) },
          ],
        }),
      });
      if (response.ok) {
        const result = await response.json() as { choices?: { message?: { content?: string } }[] };
        const generated = result.choices?.[0]?.message?.content?.trim();
        if (generated) summary = generated;
      }
    } catch {
      // The deterministic clause comparison remains available when the provider is unreachable.
    }
  }

  return Response.json({ before, after, changes, summary, heuristic: !config });
}
"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  documentId: string;
  pageNumber: number;
  highlightStart: number;
  highlightEnd: number;
};

export default function PdfPage({ documentId, pageNumber, highlightStart, highlightEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("Rendering source page…");

  useEffect(() => {
    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    let destroyDocument: (() => void) | undefined;

    async function renderPage() {
      setStatus("Rendering source page…");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
        const loadingTask = pdfjs.getDocument({ url: `/api/documents/${documentId}/file` });
        destroyDocument = () => { void loadingTask.destroy(); };
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas rendering is unavailable in this browser.");
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = canvas.parentElement?.clientWidth ?? 520;
        const scale = Math.max(0.55, Math.min(1.5, (availableWidth - 8) / baseViewport.width));
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const content = await page.getTextContent();
        type PdfTextItem = { str: string; transform: number[]; width: number; fontName: string };
        const textItems = content.items.filter((item) =>
          "str" in item && typeof item.str === "string" && item.str.length > 0,
        ) as PdfTextItem[];
        const rawParts: { text: string; start: number; end: number; item: typeof textItems[number] }[] = [];
        let rawText = "";
        for (const item of textItems) {
          if (rawText) rawText += " ";
          const start = rawText.length;
          rawText += item.str;
          rawParts.push({ text: item.str, start, end: rawText.length, item });
        }

        let normalizedText = "";
        const rawToNormalized = new Array<number>(rawText.length);
        for (let index = 0; index < rawText.length; index += 1) {
          const character = rawText[index];
          if (/\s/u.test(character)) {
            if (normalizedText && !normalizedText.endsWith(" ")) normalizedText += " ";
            rawToNormalized[index] = Math.max(0, normalizedText.length - 1);
          } else {
            rawToNormalized[index] = normalizedText.length;
            normalizedText += character;
          }
        }
        normalizedText = normalizedText.trim();

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
        });
        cancelRender = () => renderTask.cancel();
        await renderTask.promise;
        if (cancelled) return;

        if (highlightEnd > highlightStart && normalizedText) {
          context.save();
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          context.fillStyle = "rgba(247, 224, 113, 0.52)";
          for (const part of rawParts) {
            const mappedStart = rawToNormalized[part.start] ?? 0;
            const mappedEnd = (rawToNormalized[part.end - 1] ?? mappedStart) + 1;
            const selectedStart = Math.max(highlightStart, mappedStart);
            const selectedEnd = Math.min(highlightEnd, mappedEnd);
            if (selectedEnd <= selectedStart) continue;

            const transform = pdfjs.Util.transform(viewport.transform, part.item.transform);
            const fontHeight = Math.hypot(transform[2], transform[3]);
            const style = content.styles[part.item.fontName];
            context.font = `${fontHeight}px ${style?.fontFamily ?? "serif"}`;
            const totalWidth = context.measureText(part.text).width || part.text.length;
            const startInItem = Math.max(0, selectedStart - mappedStart);
            const endInItem = Math.min(part.text.length, selectedEnd - mappedStart);
            const xRatio = context.measureText(part.text.slice(0, startInItem)).width / totalWidth;
            const endRatio = context.measureText(part.text.slice(0, endInItem)).width / totalWidth;
            const itemWidth = part.item.width * scale;
            const left = transform[4] + itemWidth * xRatio;
            const width = Math.max(2, itemWidth * (endRatio - xRatio));
            const top = transform[5] - fontHeight * 0.88;
            context.fillRect(left, top, width, fontHeight * 1.18);
          }
          context.restore();
        }
        setStatus("");
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "This page could not be rendered.");
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      cancelRender?.();
      destroyDocument?.();
    };
  }, [documentId, pageNumber, highlightStart, highlightEnd]);

  return <div className="pdf-canvas-frame">
    {status && <div className="pdf-render-status">{status}</div>}
    <canvas ref={canvasRef} aria-label={`Rendered PDF page ${pageNumber}`} />
  </div>;
}
"use client";

import {
  AlertCircle, ArrowDownToLine, ArrowLeftRight, ArrowUpRight, BookOpenText,
  Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, FileCheck2,
  FilePlus2, FileText, Files, LibraryBig, LoaderCircle, MessageSquareText,
  MoreHorizontal, Search, Send, ShieldCheck, Sparkles, StopCircle, Trash2,
  Upload, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import PdfPage from "./pdf-page";

type Citation = { documentId: string; documentName: string; quote: string; pageStart: number; pageEnd: number; startOffset: number; endOffset: number; verified: true };
type Message = { id: string; role: "user" | "assistant"; content: string; citations: Citation[] };
type PageText = { pageNumber: number; text: string };
type ContractDocument = { id: string; name: string; extension: "pdf" | "docx"; size: number; uploadedAt: string; pages: PageText[]; messages: Message[] };
type Change = { id: string; title: string; status: "changed" | "added" | "removed"; significance: "high" | "medium" | "low"; before: string; after: string };
type Comparison = { before: ContractDocument; after: ContractDocument; changes: Change[]; summary: string; heuristic: boolean };

const suggestions = ["What are the termination rights?", "Is liability capped, and at what amount?", "What law governs this agreement?"];
const sizeLabel = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function highlightText(text: string, start: number, end: number) {
  if (start < 0 || end <= start || start >= text.length) return text;
  const clampedEnd = Math.min(end, text.length);
  return <>{text.slice(0, start)}<mark className="source-highlight">{text.slice(start, clampedEnd)}</mark>{text.slice(clampedEnd)}</>;
}

export default function Workspace() {
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [activeId, setActiveId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeDocument, setActiveDocument] = useState<ContractDocument | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"ask" | "research">("ask");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [uploadState, setUploadState] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [chatError, setChatError] = useState("");
  const [currentCitation, setCurrentCitation] = useState<Citation | null>(null);
  const [sourcePage, setSourcePage] = useState(1);
  const [currentView, setCurrentView] = useState<"library" | "compare">("library");
  const [beforeId, setBeforeId] = useState("");
  const [afterId, setAfterId] = useState("");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [compareFilter, setCompareFilter] = useState("all");
  const [isComparing, setIsComparing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const comparisonBeforeId = beforeId || documents[0]?.id || "";
  const comparisonAfterId = afterId || documents.find((document) => document.id !== comparisonBeforeId)?.id || "";

  async function refreshDocuments() {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load the document library.");
    const next = await response.json() as ContractDocument[];
    setDocuments(next);
    setSelectedIds((ids) => ids.filter((id) => next.some((document) => document.id === id)));
    if (!activeId && next[0]) { setActiveId(next[0].id); setSelectedIds([next[0].id]); }
    if (activeId && !next.some((document) => document.id === activeId)) {
      setActiveId(next[0]?.id ?? "");
      setSelectedIds(next[0] ? [next[0].id] : []);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/documents", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not load the document library.");
      return await response.json() as ContractDocument[];
    }).then((next) => {
      if (cancelled) return;
      setDocuments(next);
      if (next[0]) {
        setActiveId((id) => id || next[0].id);
        setSelectedIds((ids) => ids.length ? ids : [next[0].id]);
      }
    }).catch(() => { if (!cancelled) setUploadError("The document library could not be loaded."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void fetch(`/api/documents/${activeId}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("Could not open this document.");
      return await response.json() as ContractDocument;
    }).then((document) => {
      if (cancelled) return;
      setActiveDocument(document);
      setMessages(document.messages ?? []);
      setCurrentCitation((current) => current?.documentId === activeId ? current : null);
    }).catch(() => { if (!cancelled) setUploadError("This document could not be opened."); });
    return () => { cancelled = true; };
  }, [activeId]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, progress]);

  async function uploadFile(file?: File) {
    if (!file) return;
    setUploadError(""); setUploadState(`Reading ${file.name}`);
    const form = new FormData(); form.append("file", file);
    try {
      setUploadState("Extracting document text…");
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The document could not be processed.");
      const added = result as ContractDocument;
      await refreshDocuments(); setActiveId(added.id); setSelectedIds([added.id]); setCurrentView("library"); setUploadState("");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The document could not be processed."); setUploadState("");
    } finally { if (fileInput.current) fileInput.current.value = ""; }
  }

  async function removeDocument(id: string) {
    const response = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!response.ok) { setUploadError("The document could not be deleted."); setDeleteTarget(""); return; }
    setDeleteTarget(""); await refreshDocuments();
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) { const next = current.filter((selected) => selected !== id); return next.length ? next : [id]; }
      if (current.length >= 4) { setChatError("Select up to four documents for one question."); return current; }
      setChatError(""); return [...current, id];
    });
    setActiveId(id);
  }

  async function ask(value = question) {
    const prompt = value.trim();
    const ids = selectedIds.length ? selectedIds : activeId ? [activeId] : [];
    if (!prompt || !ids.length || isGenerating) return;
    setQuestion(""); setChatError(""); setProgress([]);
    const user: Message = { id: crypto.randomUUID(), role: "user", content: prompt, citations: [] };
    const assistant: Message = { id: crypto.randomUUID(), role: "assistant", content: "", citations: [] };
    setMessages((current) => [...current, user, assistant]); setIsGenerating(true);
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentIds: ids, question: prompt, mode }), signal: controller.signal });
      if (!response.ok || !response.body) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "The answer could not be generated."); }
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        const events = pending.split("\n\n"); pending = events.pop() ?? "";
        for (const block of events) {
          const data = block.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          let event: { type?: string; text?: string; message?: string; citations?: Citation[]; demoMode?: boolean };
          try { event = JSON.parse(data); } catch { continue; }
          if (event.type === "delta" && event.text) setMessages((items) => items.map((item) => item.id === assistant.id ? { ...item, content: item.content + event.text } : item));
          if (event.type === "progress" && event.message) setProgress((items) => [...items, event.message!]);
          if (event.type === "complete") {
            setMessages((items) => items.map((item) => item.id === assistant.id ? { ...item, citations: event.citations ?? [] } : item));
            if (event.demoMode) setProgress((items) => [...items, "Local evidence mode · no AI provider configured"]);
          }
          if (event.type === "error" && event.message) setChatError(event.message);
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setChatError(error instanceof Error ? error.message : "The answer could not be generated.");
        setMessages((items) => items.filter((item) => item.id !== assistant.id));
      }
    } finally { setIsGenerating(false); abortRef.current = null; void refreshDocuments(); }
  }

  async function compare() {
    if (!comparisonBeforeId || !comparisonAfterId || comparisonBeforeId === comparisonAfterId) return;
    setIsComparing(true); setChatError("");
    try {
      const response = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ beforeId: comparisonBeforeId, afterId: comparisonAfterId }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "Comparison failed.");
      setComparison(result as Comparison);
    } catch (error) { setChatError(error instanceof Error ? error.message : "Comparison failed."); }
    finally { setIsComparing(false); }
  }

  function openCitation(citation: Citation) {
    setCurrentView("library"); setActiveId(citation.documentId); setSelectedIds([citation.documentId]); setCurrentCitation(citation);
    setSourcePage(citation.pageStart);
    requestAnimationFrame(() => document.getElementById(`source-page-${citation.pageStart}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  const activeIndex = documents.findIndex((document) => document.id === activeId);
  const active = activeDocument ?? documents[activeIndex] ?? null;
  const visibleDocuments = documents.filter((document) => document.name.toLocaleLowerCase().includes(libraryQuery.toLocaleLowerCase()));
  const changes = comparison?.changes.filter((item) => compareFilter === "all" || item.significance === compareFilter) ?? [];
  const pdfPage = active?.pages.find((page) => page.pageNumber === sourcePage) ?? active?.pages[0];
  const pdfPageOffset = active && pdfPage ? active.pages.slice(0, active.pages.indexOf(pdfPage)).reduce((offset, page) => offset + page.text.length + 2, 0) : 0;
  const pdfHighlightStart = currentCitation && pdfPage && sourcePage >= currentCitation.pageStart && sourcePage <= currentCitation.pageEnd ? Math.max(0, currentCitation.startOffset - pdfPageOffset) : -1;
  const pdfHighlightEnd = currentCitation && pdfPage && sourcePage >= currentCitation.pageStart && sourcePage <= currentCitation.pageEnd ? Math.min(pdfPage.text.length, currentCitation.endOffset - pdfPageOffset) : -1;

  return <main className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Clausewise home"><span className="brand-mark"><span /><span /><span /></span><span className="brand-name">clausewise<span className="brand-period">.</span></span></a>
      <button className="upload-button" onClick={() => fileInput.current?.click()} disabled={Boolean(uploadState)}>{uploadState ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />}<span>{uploadState ? "Processing" : "Add a contract"}</span>{!uploadState && <span className="shortcut">⌘ U</span>}</button>
      <input ref={fileInput} className="visually-hidden" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void uploadFile(event.currentTarget.files?.[0])} />
      <div className="side-section-heading"><span>WORKSPACE</span><button className="icon-button tiny" aria-label="Upload contract" title="Upload contract" onClick={() => fileInput.current?.click()}><Upload size={14} /></button></div>
      <button className={`nav-row ${currentView === "library" ? "nav-active" : ""}`} onClick={() => setCurrentView("library")}><LibraryBig size={16} /><span>Contract library</span><span className="nav-count">{documents.length}</span></button>
      <button className={`nav-row ${currentView === "compare" ? "nav-active" : ""}`} onClick={() => setCurrentView("compare")}><ArrowLeftRight size={16} /><span>Compare versions</span><span className="new-dot" /></button>
      <div className="library-heading"><span>YOUR DOCUMENTS</span><span>{documents.length.toString().padStart(2, "0")}</span></div>
      <label className="library-search"><Search size={14} /><input value={libraryQuery} onChange={(event) => setLibraryQuery(event.target.value)} placeholder="Find a document" aria-label="Find a document" />{libraryQuery && <button type="button" aria-label="Clear search" onClick={() => setLibraryQuery("")}><X size={13} /></button>}</label>
      <div className="document-list">{loading ? <div className="side-loading"><LoaderCircle className="spin" size={15} /> Loading library</div> : visibleDocuments.length ? visibleDocuments.map((document) => <div key={document.id} className={`document-row ${activeId === document.id ? "document-active" : ""}`}>
        <button className="document-open" onClick={() => { setActiveId(document.id); setSelectedIds([document.id]); setCurrentView("library"); setSourcePage(1); }}><span className={`file-icon ${document.extension}`}><FileText size={15} /></span><span className="document-copy"><span className="document-name">{document.name}</span><span className="document-meta">{sizeLabel(document.size)} <span>·</span> {document.pages.length} {document.extension === "pdf" ? "pages" : "sections"}</span></span></button>
        <button className="row-more icon-button tiny" title={`Delete ${document.name}`} aria-label={`Delete ${document.name}`} onClick={() => setDeleteTarget(document.id)}><MoreHorizontal size={16} /></button>
        <button className={`selection-toggle ${selectedIds.includes(document.id) ? "is-selected" : ""}`} title={selectedIds.includes(document.id) ? "Remove from multi-document selection" : "Add to multi-document question"} aria-label={selectedIds.includes(document.id) ? "Remove from multi-document selection" : "Add to multi-document question"} onClick={() => toggleSelected(document.id)}>{selectedIds.includes(document.id) && <Check size={11} />}</button>
      </div>) : <div className="empty-library">{documents.length ? "No matching documents." : "Your next contract goes here."}</div>}</div>
      <div className="sidebar-foot"><div className="privacy-note"><ShieldCheck size={15} /><span>Private workspace<br /><small>Documents stay on this server</small></span></div><button className="help-link" onClick={() => setUploadError("Clausewise supports PDF and DOCX documents up to 45 MB. Scanned PDFs need OCR before analysis.")}><CircleHelp size={14} /> Help & file support</button><div className="profile-row"><div className="profile-avatar">CW</div><div><strong>Workspace owner</strong><span>Single-user workspace</span></div><ChevronDown size={14} /></div></div>
    </aside>

    <section className="main-column" onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setIsDragging(false); }} onDrop={(event) => { event.preventDefault(); setIsDragging(false); void uploadFile(event.dataTransfer.files?.[0]); }}>
      {isDragging && <div className="drop-overlay"><FilePlus2 size={28} /><strong>Drop a contract to add it</strong><span>PDF or DOCX · up to 45 MB</span></div>}
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{currentView === "compare" ? "Compare versions" : active?.name ?? "Contract library"}</strong></div><div className="topbar-actions"><span className="secure-label"><ShieldCheck size={14} /> PRIVATE</span><span className="topbar-divider" /><a className="external-file" href={active ? `/api/documents/${active.id}/file` : undefined} target="_blank" rel="noreferrer" aria-disabled={!active} title="Open original file"><ArrowUpRight size={15} /></a></div></header>
      {uploadError && <div className="toast toast-error"><AlertCircle size={16} /><span>{uploadError}</span><button aria-label="Dismiss" onClick={() => setUploadError("")}><X size={14} /></button></div>}

      {currentView === "compare" ? <section className="compare-view">
        <div className="view-intro"><div className="eyebrow"><ArrowLeftRight size={14} /> VERSION REVIEW</div><h1>What changed?</h1><p>Compare provisions side by side, with material changes surfaced first.</p></div>
        <div className="compare-selectors"><label><span>EARLIER VERSION</span><select value={beforeId} onChange={(event) => setBeforeId(event.target.value)}><option value="">Choose document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select></label><div className="compare-arrow"><ArrowLeftRight size={16} /></div><label><span>NEWER VERSION</span><select value={afterId} onChange={(event) => setAfterId(event.target.value)}><option value="">Choose document</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.name}</option>)}</select></label><button className="primary-button compare-run" onClick={() => void compare()} disabled={!beforeId || !afterId || beforeId === afterId || isComparing}>{isComparing ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}{isComparing ? "Comparing" : "Compare clauses"}</button></div>
        {!documents.length ? <div className="compare-empty"><Files size={24} /><strong>Add two contract versions to begin</strong><span>Upload both files to see changed, added, and removed clauses.</span></div> : !comparison ? <div className="comparison-placeholder"><span className="placeholder-symbol"><Files size={20} /></span><strong>Clause-level comparison</strong><p>Choose two versions above. We match similar provisions, then rank differences by likely significance.</p></div> : <div className="comparison-results">
          <div className="summary-band"><div className="summary-icon"><Sparkles size={17} /></div><div><span className="summary-label">PLAIN-LANGUAGE SUMMARY</span><p>{comparison.summary}</p>{comparison.heuristic && <small>Heuristic summary · add an AI provider for substantive analysis</small>}</div></div>
          <div className="change-toolbar"><div><strong>{comparison.changes.length}</strong><span> provisions changed</span></div><div className="filter-control" role="group" aria-label="Filter by significance">{["all", "high", "medium", "low"].map((filter) => <button key={filter} className={compareFilter === filter ? "filter-active" : ""} onClick={() => setCompareFilter(filter)}>{filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1)}</button>)}</div></div>
          {changes.length ? changes.map((change) => <article className="change-item" key={change.id}><div className="change-heading"><span className={`significance-dot ${change.significance}`} /><h3>{change.title}</h3><span className={`change-status ${change.status}`}>{change.status}</span><span className={`significance-tag ${change.significance}`}>{change.significance} significance</span></div><div className="change-columns"><div className="clause-before"><span>PREVIOUS</span><p>{change.before || "No corresponding clause"}</p></div><div className="clause-after"><span>UPDATED</span><p>{change.after || "Clause removed"}</p></div></div></article>) : <div className="no-changes">No provisions match this significance filter.</div>}
        </div>}
      </section> : <div className="workbench">
        <section className="conversation-pane">
          <div className="conversation-header"><div className="active-document-title"><span className="title-file"><FileCheck2 size={17} /></span><div><strong>{active?.name ?? "Your contract workspace"}</strong><span>{active ? `${active.extension.toUpperCase()} · ${active.pages.length} ${active.extension === "pdf" ? "pages" : "text sections"}` : "No document selected"}</span></div><ChevronDown size={15} className="title-chevron" /></div>{documents.length > 0 && <details className="mobile-doc-menu"><summary aria-label="Choose documents"><Files size={15} /><span>{selectedIds.length > 1 ? selectedIds.length : "Files"}</span></summary><div className="mobile-doc-menu-list">{documents.map((document) => <div key={document.id}><button className="mobile-doc-open" onClick={() => { setActiveId(document.id); setSelectedIds([document.id]); setCurrentView("library"); setSourcePage(1); }}>{document.name}</button><button className={`mobile-doc-toggle ${selectedIds.includes(document.id) ? "is-selected" : ""}`} aria-label={selectedIds.includes(document.id) ? `Remove ${document.name} from multi-document question` : `Add ${document.name} to multi-document question`} onClick={() => toggleSelected(document.id)}>{selectedIds.includes(document.id) ? <Check size={12} /> : <FilePlus2 size={12} />}</button></div>)}</div></details>}<div className="conversation-controls">{selectedIds.length > 1 && <span className="selection-count"><Files size={13} /> {selectedIds.length} documents</span>}<button className="icon-button" title="Document details" aria-label="Document details" onClick={() => active && setUploadError(`${active.name} · ${sizeLabel(active.size)} · ${active.pages.length} extracted pages`)}><MoreHorizontal size={18} /></button></div></div>
          <div className="mode-strip" role="tablist" aria-label="Analysis mode"><button role="tab" aria-selected={mode === "ask"} className={mode === "ask" ? "mode-selected" : ""} onClick={() => setMode("ask")}><MessageSquareText size={14} /> Ask</button><button role="tab" aria-selected={mode === "research"} className={mode === "research" ? "mode-selected research-selected" : ""} onClick={() => setMode("research")}><Search size={14} /> Research <span className="mode-new">TOOLS</span></button><span className="mode-description">{mode === "research" ? "Agentic search · up to 4 rounds" : "Answers grounded in the selected text"}</span></div>
          <div className="conversation-scroll">
            {!active ? <div className="welcome-state"><span className="welcome-mark"><BookOpenText size={25} /></span><div className="eyebrow">CONTRACT INTELLIGENCE, WITH RECEIPTS</div><h1>Know what<br />you&apos;re agreeing to.</h1><p>Bring a contract into your workspace. Ask a question, compare versions, and trace every answer back to its source.</p><button className="primary-button" onClick={() => fileInput.current?.click()}><FilePlus2 size={16} /> Add your first contract</button><span className="file-support">PDF or DOCX <span>·</span> max 45 MB</span><div className="welcome-rule" /><div className="welcome-foot"><ShieldCheck size={14} /> Each citation is checked against the source text.</div></div> : messages.length === 0 ? <div className="conversation-empty"><div className="empty-kicker"><span className="status-orb" /> DOCUMENT READY</div><h2>Let&apos;s get specific.</h2><p>Ask about an obligation, a deadline, a risk, or a clause. Every answer is grounded in the document and linked to its wording.</p><div className="suggestion-list">{suggestions.map((suggestion, index) => <button key={suggestion} onClick={() => void ask(suggestion)}><span>0{index + 1}</span>{suggestion}<ChevronRight size={14} /></button>)}</div></div> : <div className="message-list">
              {messages.map((message) => <article className={`message ${message.role}`} key={message.id}><div className={message.role === "assistant" ? "assistant-avatar" : "user-avatar"}>{message.role === "assistant" ? <span className="brand-mark mini"><span /><span /><span /></span> : "Y"}</div><div className="message-body"><div className="message-label">{message.role === "assistant" ? "CLAUSEWISE" : "YOU"}</div><p className="message-content">{message.content || (isGenerating ? <span className="typing-dots"><i /><i /><i /></span> : "")}</p>{message.role === "assistant" && message.citations.length > 0 && <div className="citations-block"><div className="citation-heading"><span><CheckCircle2 size={14} /> VERIFIED IN SOURCE</span><small>{message.citations.length} {message.citations.length === 1 ? "passage" : "passages"}</small></div>{message.citations.map((citation, index) => <button className="citation-card" key={`${citation.documentId}-${citation.pageStart}-${index}`} onClick={() => openCitation(citation)}><span className="citation-number">{String(index + 1).padStart(2, "0")}</span><span className="citation-content"><span className="citation-quote">“{citation.quote}”</span><span className="citation-source"><FileText size={12} /> {citation.documentName} <i /> p. {citation.pageStart}{citation.pageEnd !== citation.pageStart ? `–${citation.pageEnd}` : ""}</span></span><ArrowUpRight size={14} className="citation-open" /></button>)}</div>}{message.role === "assistant" && !message.content && isGenerating && <div className="stream-note"><LoaderCircle className="spin" size={13} /> Checking the selected document</div>}</div></article>)}
              {progress.length > 0 && <div className="research-activity"><div className="activity-top"><Sparkles size={13} /> RESEARCH ACTIVITY</div>{progress.slice(-4).map((item, index) => <div className="activity-line" key={`${item}-${index}`}><span className={index === progress.slice(-4).length - 1 && isGenerating ? "activity-current" : "activity-done"}>{index === progress.slice(-4).length - 1 && isGenerating ? <LoaderCircle className="spin" size={12} /> : <Check size={12} />}</span>{item}</div>)}</div>}
              {chatError && <div className="inline-error"><AlertCircle size={15} />{chatError}<button onClick={() => setChatError("")} aria-label="Dismiss error"><X size={13} /></button></div>}<div ref={chatEnd} />
            </div>}
          </div>
          {chatError && messages.length === 0 && <div className="inline-error composer-error"><AlertCircle size={15} />{chatError}<button onClick={() => setChatError("")} aria-label="Dismiss error"><X size={13} /></button></div>}
          <form className="composer" onSubmit={(event) => { event.preventDefault(); void ask(); }}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void ask(); } }} placeholder={active ? mode === "research" ? "Ask a question. Clausewise will search before answering…" : "Ask anything about this contract…" : "Add a contract to start asking questions"} disabled={!active || isGenerating} rows={2} aria-label="Ask a question about the selected contract" /><div className="composer-bottom"><span className="composer-assurance"><ShieldCheck size={13} /> Source-checked answers</span><div>{isGenerating ? <button type="button" className="stop-button" onClick={() => abortRef.current?.abort()}><StopCircle size={15} /> Stop answer</button> : <button className="send-button" type="submit" disabled={!question.trim() || !active} aria-label="Send question"><Send size={15} /></button>}</div></div></form>
          <div className="conversation-disclaimer">Clausewise supports contract review. It is not legal advice.</div>
        </section>

        <aside className={`source-pane ${currentCitation ? "source-open" : ""}`}><div className="source-header"><div><span className="source-eyebrow"><BookOpenText size={13} /> SOURCE DOCUMENT</span><strong>{active?.name ?? "Document reader"}</strong></div><div className="source-actions"><button className="icon-button mobile-source-close" title="Close source" aria-label="Close source" onClick={() => setCurrentCitation(null)}><X size={15} /></button><button className="icon-button" title="Download original" aria-label="Download original" disabled={!active} onClick={() => active && window.open(`/api/documents/${active.id}/file`, "_blank", "noopener,noreferrer")}><ArrowDownToLine size={15} /></button><button className="icon-button" title="Open original file" aria-label="Open original file" disabled={!active} onClick={() => active && window.open(`/api/documents/${active.id}/file`, "_blank", "noopener,noreferrer")}><ArrowUpRight size={15} /></button></div></div>
          {!active ? <div className="source-empty"><BookOpenText size={20} /><span>Your source passages will appear here.</span></div> : <div className="source-scroll"><div className="source-document-meta"><span>{active.extension === "pdf" ? "RENDERED PDF PAGE" : "EXTRACTED DOCX TEXT"}</span><span>{active.pages.length} {active.extension === "pdf" ? "PAGES" : "SECTIONS"}</span></div>{currentCitation && <div className="source-focus"><span><CheckCircle2 size={13} /> SOURCE VERIFIED</span><button onClick={() => setCurrentCitation(null)} aria-label="Clear citation highlight"><X size={13} /></button></div>}{active.extension === "pdf" && pdfPage ? <div className="pdf-reader" id={`source-page-${sourcePage}`}><div className="pdf-page-controls"><button className="icon-button tiny" aria-label="Previous PDF page" title="Previous page" disabled={sourcePage <= 1} onClick={() => setSourcePage((page) => Math.max(1, page - 1))}><ChevronLeft size={15} /></button><span>PAGE <strong>{sourcePage}</strong> <i /> {active.pages.length}</span><button className="icon-button tiny" aria-label="Next PDF page" title="Next page" disabled={sourcePage >= active.pages.length} onClick={() => setSourcePage((page) => Math.min(active.pages.length, page + 1))}><ChevronRight size={15} /></button></div><PdfPage documentId={active.id} pageNumber={sourcePage} highlightStart={pdfHighlightStart} highlightEnd={pdfHighlightEnd} /><details className="extracted-page-text"><summary>Read extracted page text</summary><p>{highlightText(pdfPage.text || "No readable text on this page.", pdfHighlightStart, pdfHighlightEnd)}</p></details></div> : active.pages.map((page, index) => { const inRange = currentCitation && page.pageNumber >= currentCitation.pageStart && page.pageNumber <= currentCitation.pageEnd; const pageOffset = active.pages.slice(0, index).reduce((offset, previous) => offset + previous.text.length + 2, 0); const start = currentCitation && inRange ? Math.max(0, currentCitation.startOffset - pageOffset) : -1; const end = currentCitation && inRange ? Math.min(page.text.length, currentCitation.endOffset - pageOffset) : -1; return <article className={`source-page ${inRange ? "page-cited" : ""}`} id={`source-page-${page.pageNumber}`} key={page.pageNumber}><div className="page-heading"><span>SECTION {String(page.pageNumber).padStart(2, "0")}</span>{inRange && <span className="page-cited-label"><Check size={11} /> CITED</span>}</div><p>{highlightText(page.text || "No readable text in this section.", start, end)}</p></article>; })}</div>}
          <div className="source-footer"><span><span className="footer-dot" /> SOURCE TEXT EXTRACTED</span><span>{active ? sizeLabel(active.size) : "—"}</span></div>
        </aside>
      </div>}
    </section>

    {deleteTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(""); }}><div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="modal-icon"><Trash2 size={18} /></div><h2 id="delete-title">Delete this document?</h2><p>The original file and its extracted text and chat history will be removed from this workspace.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget("")}>Keep document</button><button className="danger-button" onClick={() => void removeDocument(deleteTarget)}>Delete document</button></div></div></div>}
  </main>;
}
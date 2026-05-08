import { App, FuzzySuggestModal, FuzzyMatch } from "obsidian";
import type { SessionSummary } from "./types";

export class Saga20SearchModal extends FuzzySuggestModal<SessionSummary> {
  private sessions: SessionSummary[];
  private onPick: (session: SessionSummary) => void | Promise<void>;

  constructor(
    app: App,
    sessions: SessionSummary[],
    onPick: (session: SessionSummary) => void | Promise<void>,
  ) {
    super(app);
    this.sessions = sessions;
    this.onPick = onPick;
    this.setPlaceholder("Type a session number, title, or any keyword…");
    this.setInstructions([
      { command: "↵", purpose: "open" },
      { command: "esc", purpose: "cancel" },
    ]);
  }

  getItems(): SessionSummary[] {
    return this.sessions;
  }

  getItemText(session: SessionSummary): string {
    const date = formatDate(session.recording_date);
    const title = session.title || "Untitled session";
    const status = session.status ? ` (${session.status})` : "";
    return date ? `${title} — ${date}${status}` : `${title}${status}`;
  }

  // Override to render a richer two-line item rather than a single line of text.
  renderSuggestion(item: FuzzyMatch<SessionSummary>, el: HTMLElement): void {
    const session = item.item;
    el.addClass("saga20-suggestion");
    el.createDiv({ text: session.title || "Untitled session" });
    const meta = el.createDiv({ cls: "saga20-suggestion-meta" });
    const date = formatDate(session.recording_date);
    if (date) meta.createSpan({ text: date });
    if (session.status) meta.createSpan({ text: ` · ${session.status}` });
  }

  onChooseItem(session: SessionSummary): void {
    void this.onPick(session);
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

import { ItemView, WorkspaceLeaf, setIcon, Menu, Notice } from "obsidian";
import type Saga20Plugin from "./main";
import type { SessionSummary } from "./types";

export const SAGA20_SESSIONS_VIEW_TYPE = "saga20-sessions-view";

export class Saga20SessionsView extends ItemView {
  private plugin: Saga20Plugin;
  private sessions: SessionSummary[] = [];
  private filter = "";
  private loading = false;
  private errorMessage: string | null = null;

  private listEl!: HTMLElement;
  private statusEl!: HTMLElement;
  private filterInput!: HTMLInputElement;

  constructor(leaf: WorkspaceLeaf, plugin: Saga20Plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SAGA20_SESSIONS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Saga20 sessions";
  }

  getIcon(): string {
    return "scroll-text";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("saga20-sessions-view");

    const toolbar = root.createDiv({ cls: "saga20-toolbar" });
    this.filterInput = toolbar.createEl("input", {
      type: "text",
      placeholder: "Filter sessions…",
    });
    this.filterInput.addEventListener("input", () => {
      this.filter = this.filterInput.value.toLowerCase().trim();
      this.renderList();
    });

    const refreshBtn = toolbar.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "Refresh sessions" },
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => void this.refresh(true));

    this.statusEl = root.createDiv({ cls: "saga20-status" });
    this.listEl = root.createEl("ul", { cls: "saga20-list" });

    await this.refresh(false);
  }

  async onClose(): Promise<void> {
    // Nothing to clean up — listeners live on the elements which Obsidian disposes.
  }

  onSessionsUpdated(sessions: SessionSummary[]) {
    this.sessions = sessions;
    this.errorMessage = null;
    this.renderList();
    this.renderStatus();
  }

  private async refresh(force: boolean) {
    if (!this.plugin.settings.apiKey.trim()) {
      this.errorMessage = "No API key configured. Open plugin settings to add one.";
      this.sessions = [];
      this.renderStatus();
      this.renderList();
      return;
    }
    this.loading = true;
    this.errorMessage = null;
    this.renderStatus();
    try {
      const sessions = await this.plugin.getSessions(force);
      this.sessions = sessions;
    } catch (err) {
      this.errorMessage = (err as Error)?.message ?? "Failed to load sessions.";
      this.sessions = [];
    } finally {
      this.loading = false;
      this.renderStatus();
      this.renderList();
    }
  }

  private renderStatus() {
    this.statusEl.empty();
    if (this.loading) {
      this.statusEl.setText("Loading sessions…");
      return;
    }
    if (this.errorMessage) {
      const err = this.statusEl.createDiv({ cls: "saga20-error" });
      err.setText(this.errorMessage);
      return;
    }
    const total = this.sessions.length;
    const visible = this.filteredSessions().length;
    if (this.filter) {
      this.statusEl.setText(`${visible} of ${total} session${total === 1 ? "" : "s"}`);
    } else {
      this.statusEl.setText(`${total} session${total === 1 ? "" : "s"}`);
    }
  }

  private filteredSessions(): SessionSummary[] {
    if (!this.filter) return this.sessions;
    const q = this.filter;
    return this.sessions.filter((s) => (s.title ?? "").toLowerCase().includes(q));
  }

  private renderList() {
    this.listEl.empty();
    const visible = this.filteredSessions();
    if (visible.length === 0) {
      const empty = this.listEl.createEl("li", { cls: "saga20-empty" });
      if (this.errorMessage) {
        empty.setText("Couldn't load sessions.");
      } else if (this.sessions.length === 0) {
        empty.setText("No sessions yet.");
      } else {
        empty.setText("No sessions match that filter.");
      }
      return;
    }
    for (const session of visible) {
      this.renderItem(session);
    }
  }

  private renderItem(session: SessionSummary) {
    const li = this.listEl.createEl("li", { cls: "saga20-item" });
    li.createDiv({
      cls: "saga20-item-title",
      text: session.title || "Untitled session",
    });
    const meta = li.createDiv({ cls: "saga20-item-meta" });
    const date = formatDate(session.recording_date);
    if (date) meta.createSpan({ cls: "saga20-item-date", text: date });
    if (session.status) {
      const statusEl = meta.createSpan({
        cls: "saga20-item-status",
        text: session.status,
      });
      statusEl.setAttribute("data-status", session.status);
    }

    li.addEventListener("click", () => {
      void this.plugin.openSessionView(session.id);
    });
    li.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      const menu = new Menu();
      menu.addItem((item) =>
        item
          .setTitle("Open recap")
          .setIcon("scroll-text")
          .onClick(() => void this.plugin.openSessionView(session.id)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Save to vault")
          .setIcon("save")
          .onClick(() => void this.plugin.saveSessionToVault(session.id)),
      );
      menu.addItem((item) =>
        item
          .setTitle("Copy session ID")
          .setIcon("clipboard")
          .onClick(async () => {
            await navigator.clipboard.writeText(session.id);
            new Notice("Session ID copied.");
          }),
      );
      menu.showAtMouseEvent(evt);
    });
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

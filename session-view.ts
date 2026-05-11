import {
  ItemView,
  MarkdownRenderer,
  Notice,
  WorkspaceLeaf,
  setIcon,
  ViewStateResult,
  Component,
} from "obsidian";
import type Saga20Plugin from "./main";
import type { SessionDetail } from "./types";

export const SAGA20_SESSION_VIEW_TYPE = "saga20-session-view";

interface State {
  sessionId?: string;
}

export class Saga20SessionView extends ItemView {
  private plugin: Saga20Plugin;
  private sessionId: string | null = null;
  private session: SessionDetail | null = null;
  private loading = false;
  private errorMessage: string | null = null;

  private headerEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private renderChild: Component | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: Saga20Plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return SAGA20_SESSION_VIEW_TYPE;
  }

  getDisplayText(): string {
    if (this.session?.title) return this.session.title;
    return "Saga20 session";
  }

  getIcon(): string {
    return "scroll-text";
  }

  async onOpen(): Promise<void> {
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("saga20-session-view");

    this.headerEl = root.createDiv({ cls: "saga20-session-header" });
    this.bodyEl = root.createDiv({ cls: "saga20-session-body" });

    this.renderHeader();
    if (this.sessionId) await this.fetchSession();
  }

  onClose(): Promise<void> {
    this.disposeRenderChild();
    return Promise.resolve();
  }

  async setState(state: State, result: ViewStateResult): Promise<void> {
    const id = state?.sessionId ?? null;
    if (id !== this.sessionId) {
      this.sessionId = id;
      this.session = null;
      this.errorMessage = null;
      // The view body may not exist yet on first setState before onOpen.
      if (this.headerEl) this.renderHeader();
      if (this.bodyEl && this.sessionId) await this.fetchSession();
      else if (this.bodyEl) void this.renderBody();
    }
    await super.setState(state, result);
  }

  getState(): Record<string, unknown> {
    return { ...super.getState(), sessionId: this.sessionId };
  }

  private async fetchSession() {
    if (!this.sessionId) return;
    this.loading = true;
    this.errorMessage = null;
    this.renderHeader();
    void this.renderBody();
    try {
      this.session = await this.plugin.api.getSession(this.sessionId);
    } catch (err) {
      this.errorMessage = (err as Error)?.message ?? "Couldn't load session.";
      this.session = null;
    } finally {
      this.loading = false;
      this.renderHeader();
      await this.renderBody();
    }
  }

  private renderHeader() {
    this.headerEl.empty();
    const titleText = this.session?.title || (this.loading ? "Loading…" : "Saga20 session");
    this.headerEl.createEl("h1", {
      cls: "saga20-session-title",
      text: titleText,
    });

    const meta = this.headerEl.createDiv({ cls: "saga20-session-meta" });
    if (this.session) {
      const date = formatDate(this.session.recording_date);
      if (date) meta.createSpan({ text: `Recorded ${date}` });
      if (this.session.status) meta.createSpan({ text: `Status: ${this.session.status}` });
      if (this.session.session_type) meta.createSpan({ text: `Type: ${this.session.session_type}` });
      if (this.session.visibility) meta.createSpan({ text: `Visibility: ${this.session.visibility}` });
    }

    const actions = this.headerEl.createDiv({ cls: "saga20-session-actions" });

    const refreshBtn = actions.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": "Refresh session" },
    });
    setIcon(refreshBtn, "refresh-cw");
    refreshBtn.addEventListener("click", () => void this.fetchSession());

    if (this.session) {
      const saveBtn = actions.createEl("button", { text: "Save to vault" });
      saveBtn.addEventListener("click", () => {
        if (!this.session) return;
        void this.plugin.saveSessionToVault(this.session.id);
      });

      const copyBtn = actions.createEl("button", { text: "Copy Markdown" });
      copyBtn.addEventListener("click", () => {
        if (!this.session) return;
        const md = this.session.summary_markdown || this.session.summary_text || "";
        void navigator.clipboard.writeText(md);
        new Notice("Saga20: copied recap Markdown.");
      });

      const url = `${this.plugin.settings.appBase.replace(/\/$/, "")}/sessions/${this.session.id}`;
      const linkBtn = actions.createEl("a", {
        text: "View on the web",
        href: url,
        cls: "external-link",
      });
      linkBtn.setAttr("target", "_blank");
      linkBtn.setAttr("rel", "noopener");
    }
  }

  private async renderBody() {
    this.disposeRenderChild();
    this.bodyEl.empty();

    if (this.loading) {
      this.bodyEl.createDiv({ cls: "saga20-status", text: "Loading recap…" });
      return;
    }
    if (this.errorMessage) {
      this.bodyEl.createDiv({ cls: "saga20-error", text: this.errorMessage });
      return;
    }
    if (!this.session) {
      this.bodyEl.createDiv({ cls: "saga20-empty", text: "No session loaded." });
      return;
    }

    const md = (this.session.summary_markdown || this.session.summary_text || "").trim();
    if (!md) {
      this.bodyEl.createDiv({
        cls: "saga20-no-summary",
        text: "No summary yet for this session.",
      });
      return;
    }

    // Render the FULL markdown, no truncation.
    const child = new Component();
    child.load();
    this.renderChild = child;
    await MarkdownRenderer.render(this.app, md, this.bodyEl, "", child);
  }

  private disposeRenderChild() {
    if (this.renderChild) {
      this.renderChild.unload();
      this.renderChild = null;
    }
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

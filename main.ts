import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  WorkspaceLeaf,
  normalizePath,
  TFile,
  TFolder,
  stringifyYaml,
} from "obsidian";

import { Saga20Api, Saga20ApiError } from "./api";
import {
  DEFAULT_SETTINGS,
  Saga20PluginSettings,
  SessionDetail,
  SessionSummary,
} from "./types";
import {
  Saga20SessionsView,
  SAGA20_SESSIONS_VIEW_TYPE,
} from "./sessions-view";
import {
  Saga20SessionView,
  SAGA20_SESSION_VIEW_TYPE,
} from "./session-view";
import { Saga20SearchModal } from "./search-modal";

export default class Saga20Plugin extends Plugin {
  settings: Saga20PluginSettings = { ...DEFAULT_SETTINGS };
  api!: Saga20Api;

  private indexCache: SessionSummary[] | null = null;
  private indexFetchedAt = 0;
  private indexInflight: Promise<SessionSummary[]> | null = null;

  async onload() {
    await this.loadSettings();

    this.api = new Saga20Api(
      () => this.settings.apiKey,
      () => this.settings.apiBase,
    );

    this.registerView(
      SAGA20_SESSIONS_VIEW_TYPE,
      (leaf) => new Saga20SessionsView(leaf, this),
    );
    this.registerView(
      SAGA20_SESSION_VIEW_TYPE,
      (leaf) => new Saga20SessionView(leaf, this),
    );

    this.addRibbonIcon("scroll-text", "Saga20: browse sessions", () => {
      void this.activateSessionsView();
    });

    this.addCommand({
      id: "browse-sessions",
      name: "Browse sessions",
      callback: () => void this.activateSessionsView(),
    });

    this.addCommand({
      id: "open-session",
      name: "Open session…",
      callback: () => void this.openSearchModal("open"),
    });

    this.addCommand({
      id: "save-session-to-vault",
      name: "Save session to vault…",
      callback: () => void this.openSearchModal("save"),
    });

    this.addCommand({
      id: "refresh-sessions",
      name: "Refresh sessions cache",
      callback: () => void this.refreshSessions(true),
    });

    this.addSettingTab(new Saga20SettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      // No autoload of the sidebar view — let users open it explicitly.
    });
  }

  onunload() {
    // Leaves themselves persist; Obsidian recycles them with the registered factories.
  }

  async loadSettings() {
    const data = (await this.loadData()) as Partial<Saga20PluginSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...(data ?? {}) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  invalidateSessionsCache() {
    this.indexCache = null;
    this.indexFetchedAt = 0;
  }

  getSessions(force = false): Promise<SessionSummary[]> {
    const ttlMs = Math.max(0, this.settings.cacheTtlSeconds) * 1000;
    const fresh = this.indexCache && Date.now() - this.indexFetchedAt < ttlMs;
    if (!force && fresh && this.indexCache) return Promise.resolve(this.indexCache);
    if (this.indexInflight) return this.indexInflight;

    this.indexInflight = (async () => {
      try {
        const all = await this.api.listAllSessions();
        this.indexCache = all;
        this.indexFetchedAt = Date.now();
        return all;
      } finally {
        this.indexInflight = null;
      }
    })();
    return this.indexInflight;
  }

  async refreshSessions(showNotice = false): Promise<SessionSummary[] | null> {
    try {
      const sessions = await this.getSessions(true);
      if (showNotice) {
        new Notice(`Saga20: refreshed (${sessions.length} session${sessions.length === 1 ? "" : "s"}).`);
      }
      // Notify any open sessions view so it can re-render.
      this.app.workspace
        .getLeavesOfType(SAGA20_SESSIONS_VIEW_TYPE)
        .forEach((leaf) => {
          const view = leaf.view;
          if (view instanceof Saga20SessionsView) view.onSessionsUpdated(sessions);
        });
      return sessions;
    } catch (err) {
      this.notifyError(err);
      return null;
    }
  }

  async activateSessionsView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(SAGA20_SESSIONS_VIEW_TYPE)[0];
    if (!leaf) {
      const left = workspace.getLeftLeaf(false);
      if (!left) {
        new Notice("Saga20: couldn't open the sessions sidebar — no available pane.");
        return;
      }
      leaf = left;
      await leaf.setViewState({ type: SAGA20_SESSIONS_VIEW_TYPE, active: true });
    }
    void workspace.revealLeaf(leaf);
  }

  async openSessionView(id: string) {
    if (!id) return;
    const { workspace } = this.app;

    // Reuse an existing detail view if present, otherwise open in a new tab.
    const existing = workspace
      .getLeavesOfType(SAGA20_SESSION_VIEW_TYPE)
      .find((leaf) => {
        const state = leaf.getViewState().state as { sessionId?: string } | undefined;
        return state?.sessionId === id;
      });

    let leaf: WorkspaceLeaf;
    if (existing) {
      leaf = existing;
    } else {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({
        type: SAGA20_SESSION_VIEW_TYPE,
        active: true,
        state: { sessionId: id },
      });
    }
    void workspace.revealLeaf(leaf);
  }

  async openSearchModal(mode: "open" | "save") {
    if (!this.settings.apiKey.trim()) {
      new Notice("Saga20: add your API key in plugin settings first.");
      return;
    }
    let sessions: SessionSummary[];
    try {
      sessions = await this.getSessions();
    } catch (err) {
      this.notifyError(err);
      return;
    }
    if (sessions.length === 0) {
      new Notice("Saga20: no sessions found for this API key yet.");
      return;
    }
    new Saga20SearchModal(this.app, sessions, async (picked) => {
      if (mode === "open") {
        await this.openSessionView(picked.id);
      } else {
        await this.saveSessionToVault(picked.id);
      }
    }).open();
  }

  async saveSessionToVault(id: string): Promise<TFile | null> {
    let session: SessionDetail;
    try {
      session = await this.api.getSession(id);
    } catch (err) {
      this.notifyError(err);
      return null;
    }

    const folder = (this.settings.notesFolder || "Saga20 sessions").trim() || "Saga20 sessions";
    const folderPath = normalizePath(folder);
    await this.ensureFolder(folderPath);

    const baseName = sanitizeFileName(session.title || `Session ${session.id.slice(0, 8)}`);
    const filePath = this.uniquePath(`${folderPath}/${baseName}.md`);

    const content = renderSessionMarkdown(session, this.settings.appBase);

    const file = await this.app.vault.create(filePath, content);
    new Notice(`Saga20: saved "${baseName}" to ${folderPath}.`);
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.openFile(file);
    return file;
  }

  notifyError(err: unknown) {
    if (err instanceof Saga20ApiError) {
      new Notice(`Saga20: ${err.message}`, 8000);
    } else {
      new Notice(`Saga20: ${(err as Error)?.message ?? "unknown error"}`, 8000);
      console.error("Saga20 error", err);
    }
  }

  private async ensureFolder(path: string): Promise<void> {
    if (!path) return;
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFolder) return;
    if (existing) {
      throw new Error(`Path ${path} exists and isn't a folder.`);
    }
    await this.app.vault.createFolder(path);
  }

  private uniquePath(path: string): string {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const dot = path.lastIndexOf(".");
    const stem = dot === -1 ? path : path.slice(0, dot);
    const ext = dot === -1 ? "" : path.slice(dot);
    for (let i = 2; i < 1000; i++) {
      const candidate = `${stem} (${i})${ext}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    return `${stem} (${Date.now()})${ext}`;
  }
}

function sanitizeFileName(input: string): string {
  // Obsidian forbids: \ / : * ? " < > |  — replace with spaces, collapse whitespace.
  const cleaned = input.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
  const trimmed = cleaned.length > 120 ? cleaned.slice(0, 120).trim() : cleaned;
  return trimmed || "Untitled session";
}

function renderSessionMarkdown(session: SessionDetail, appBase: string): string {
  const url = `${appBase.replace(/\/$/, "")}/sessions/${session.id}`;
  const recordingDate = formatDate(session.recording_date);
  const summary = (session.summary_markdown || session.summary_text || "").trim();
  const frontmatter = stringifyYaml({
    saga20_id: session.id,
    title: session.title || "Untitled session",
    status: session.status ?? null,
    session_type: session.session_type ?? null,
    visibility: session.visibility ?? null,
    recording_date: session.recording_date ?? null,
    saga20_url: url,
    source: "saga20",
  });
  const heading = session.title || "Untitled session";
  const meta = recordingDate ? `*Recorded ${recordingDate}*\n\n` : "";
  const body = summary || "_No summary yet for this session._";
  return `---\n${frontmatter}---\n\n# ${heading}\n\n${meta}${body}\n\n---\n\n[View on Saga20](${url})\n`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

class Saga20SettingTab extends PluginSettingTab {
  plugin: Saga20Plugin;

  constructor(app: App, plugin: Saga20Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const intro = containerEl.createEl("p");
    intro.appendText("Paste your Saga20 public API key below. Create one at ");
    intro.createEl("a", { text: "Saga20 web app", href: "https://app.saga20.com" });
    intro.appendText(".");

    new Setting(containerEl)
      .setName("API key")
      .setDesc("Saga20 public API key. The prefix is 's20_live_'.")
      .addText((text) =>
        text
          .setPlaceholder("Paste your API key here")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            this.plugin.invalidateSessionsCache();
            await this.plugin.saveSettings();
          })
          .inputEl.setAttribute("type", "password"),
      );

    new Setting(containerEl)
      .setName("Test connection")
      .setDesc("Saga20: verify the API key.")
      .addButton((btn) =>
        btn
          .setButtonText("Test")
          .setCta()
          .onClick(async () => {
            btn.setDisabled(true).setButtonText("Testing…");
            try {
              await this.plugin.api.probe();
              new Notice("Saga20: connected.");
            } catch (err) {
              this.plugin.notifyError(err);
            } finally {
              btn.setDisabled(false).setButtonText("Test");
            }
          }),
      );

    new Setting(containerEl)
      .setName("Notes folder")
      .setDesc("Folder where saved sessions are written.")
      .addText((text) =>
        text
          .setPlaceholder("Saga20 sessions")
          .setValue(this.plugin.settings.notesFolder)
          .onChange(async (value) => {
            this.plugin.settings.notesFolder = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Cache duration (seconds)")
      .setDesc("How long to cache the session list before refetching; 0 disables caching.")
      .addText((text) =>
        text
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.cacheTtlSeconds))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            this.plugin.settings.cacheTtlSeconds = Number.isFinite(n) && n >= 0 ? n : 0;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("API base URL")
      .setDesc("Override only if instructed.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.apiBase)
          .setValue(this.plugin.settings.apiBase)
          .onChange(async (value) => {
            this.plugin.settings.apiBase = value.trim() || DEFAULT_SETTINGS.apiBase;
            this.plugin.invalidateSessionsCache();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("App base URL")
      .setDesc("Used to build links back to the web app.")
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.appBase)
          .setValue(this.plugin.settings.appBase)
          .onChange(async (value) => {
            this.plugin.settings.appBase = value.trim() || DEFAULT_SETTINGS.appBase;
            await this.plugin.saveSettings();
          }),
      );
  }
}

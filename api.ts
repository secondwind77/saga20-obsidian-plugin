import { requestUrl, RequestUrlParam } from "obsidian";
import type { PaginatedSessions, SessionDetail, SessionSummary } from "./types";

const PAGE_SIZE = 100;
const MAX_PAGES = 100;

export class Saga20ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "Saga20ApiError";
    this.status = status;
  }
}

export class Saga20Api {
  constructor(
    private getApiKey: () => string,
    private getApiBase: () => string,
  ) {}

  private async request<T>(path: string): Promise<T> {
    const apiKey = this.getApiKey().trim();
    if (!apiKey) {
      throw new Saga20ApiError(0, "No Saga20 API key configured. Set one in plugin settings.");
    }

    const url = `${this.getApiBase().replace(/\/$/, "")}${path}`;
    const params: RequestUrlParam = {
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      throw: false,
    };

    let res;
    try {
      res = await requestUrl(params);
    } catch (err) {
      throw new Saga20ApiError(0, `Network error reaching Saga20: ${(err as Error).message ?? err}`);
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Saga20ApiError(res.status, friendlyMessage(res.status));
    }

    try {
      return res.json as T;
    } catch {
      throw new Saga20ApiError(res.status, "Saga20 returned an unparseable response.");
    }
  }

  listSessionsPage(cursor?: string | null): Promise<PaginatedSessions> {
    const qs = cursor
      ? `?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(cursor)}`
      : `?limit=${PAGE_SIZE}`;
    return this.request<PaginatedSessions>(`/sessions${qs}`);
  }

  async listAllSessions(): Promise<SessionSummary[]> {
    const all: SessionSummary[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res: PaginatedSessions = await this.listSessionsPage(cursor);
      const items = Array.isArray(res?.data) ? res.data : [];
      for (const s of items) all.push(s);
      const hasMore = res?.pagination?.has_more === true;
      const next = res?.pagination?.next_cursor ?? null;
      if (!hasMore || !next) return all;
      cursor = next;
    }
    return all;
  }

  getSession(id: string): Promise<SessionDetail> {
    return this.request<SessionDetail>(`/sessions/${encodeURIComponent(id)}`);
  }

  async probe(): Promise<void> {
    await this.request<PaginatedSessions>("/sessions?limit=1");
  }
}

function friendlyMessage(status: number): string {
  if (status === 401) return "API key was rejected. Check your key in Saga20 plugin settings.";
  if (status === 403) return "Saga20 Public API access requires an active paid plan on the owning account.";
  if (status === 404) return "Saga20 resource not found.";
  if (status === 429) return "Saga20 API rate limit hit. Try again in a minute.";
  if (status >= 500) return `Saga20 API is having issues (${status}). Try again shortly.`;
  return `Saga20 API returned ${status}.`;
}

export type SessionStatus = "draft" | "processing" | "completed" | "failed" | string;
export type SessionVisibility = "public" | "private" | string;
export type SessionType = "audio" | "text_doc" | string;

export interface SessionSummary {
  id: string;
  title: string | null;
  status: SessionStatus;
  recording_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  session_type: SessionType | null;
  visibility: SessionVisibility | null;
}

export interface SessionDetail extends SessionSummary {
  summary_markdown: string | null;
  summary_text: string | null;
}

export interface PaginatedSessions {
  data: SessionSummary[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
  };
}

export interface Saga20PluginSettings {
  apiKey: string;
  apiBase: string;
  appBase: string;
  notesFolder: string;
  cacheTtlSeconds: number;
}

export const DEFAULT_SETTINGS: Saga20PluginSettings = {
  apiKey: "",
  apiBase: "https://app.saga20.com/api/public/v1",
  appBase: "https://app.saga20.com",
  notesFolder: "Saga20 Sessions",
  cacheTtlSeconds: 60,
};

export type MatchType = "contains" | "exact" | "any";

export type Automation = {
  id: string;
  name: string;
  active: boolean;
  trigger_comment: boolean;
  trigger_story: boolean;
  trigger_dm: boolean;
  keywords: string[];
  match_type: MatchType;
  media_id: string | null;
  public_replies: string[];
  welcome_dm: string;
  quick_reply_label: string | null;
  link_message: string | null;
  link_button_label: string | null;
  link_url: string | null;
  link_delay_minutes: number;
  reminder_message: string | null;
  reminder_delay_minutes: number;
  created_at: string;
  updated_at: string;
};

export type Followup = {
  id: string;
  automation_id: string;
  step: number;
  kind: "link" | "reminder";
  delay_minutes: number;
  payload: { text?: string; url?: string; button?: string };
};

export type Contact = {
  id: string;
  ig_id: string;
  username: string | null;
  first_seen_at: string;
  last_reply_at: string | null;
  last_automation_id: string | null;
  updated_at?: string;
};

export type Config = {
  id: number;
  ig_user_id: string | null;
  ig_username: string | null;
  ig_name: string | null;
  profile_picture_url: string | null;
  access_token: string | null;
  token_expires_at: string | null;
  token_refreshed_at: string | null;
  updated_at: string;
};

export type QueueItem = {
  id: string;
  status: "pending" | "sending" | "sent" | "failed" | "skipped";
  kind: "private_reply" | "public_reply" | "welcome_dm" | "link" | "reminder";
  automation_id: string | null;
  contact_id: string | null;
  recipient_comment_id: string | null;
  recipient_ig_id: string | null;
  comment_id: string | null;
  payload: { text?: string; url?: string; button?: string; quick_reply?: string };
  requires_window: boolean;
  run_after: string;
  attempts: number;
  claimed_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  dedupe_key: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  kind: string | null;
  ig_id: string | null;
  username: string | null;
  text: string | null;
  comment_id: string | null;
  media_id: string | null;
  matched_automation_id: string | null;
  note: string | null;
  raw: unknown;
  created_at: string;
};

export type Media = {
  id: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  caption?: string;
  permalink?: string;
  timestamp?: string;
};

import type { Automation, Config, Contact, EventRow, Followup, QueueItem } from "./types";

// Tipagem mínima do banco para o supabase-js. Sem isso ele trata toda tabela
// desconhecida como `never` e nenhum insert/update compila.
type Table<Row> = {
  Row: Row;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row> & Record<string, unknown>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      config: Table<Config>;
      automations: Table<Automation>;
      followups: Table<Followup>;
      contacts: Table<Contact>;
      queue: Table<QueueItem>;
      events: Table<EventRow>;
    };
    Views: Record<never, never>;
    Functions: {
      claim_queue_items: { Args: { p_limit: number }; Returns: QueueItem[] };
      dm_sent_last_hour: { Args: Record<never, never>; Returns: number };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

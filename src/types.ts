export interface Alarm {
  id: string;
  time: string; // ISO string
  message: string;
  chatIds: string[];
  active: boolean;
  repeat?: 'none' | 'daily' | 'weekly';
  error?: string | null;
}

export interface Contact {
  id: string;
  name: string;
  chatId: string;
}

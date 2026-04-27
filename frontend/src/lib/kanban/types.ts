// Subset of the SmartKanban card shape that the mirror needs to render.
// Kept minimal so the tile is decoupled from full server schema changes.

export type KanbanStatus = 'backlog' | 'today' | 'in_progress' | 'done';

export type KanbanCard = {
  id: string;
  title: string;
  status: KanbanStatus;
  tags: string[];
  project: string | null;
  updated_at: string;
  description?: string;
};

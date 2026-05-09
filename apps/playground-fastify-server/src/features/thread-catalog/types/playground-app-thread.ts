type JsonRecord = Record<string, unknown>;

export type PlaygroundAppThread = {
  id: string;
  appId: string;
  userId?: string | null;
  title?: string | null;
  status: 'active' | 'archived';
  metadata?: JsonRecord | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
};

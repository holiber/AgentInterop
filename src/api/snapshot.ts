export type ApiSnapshotPattern = "unary" | "serverStream";

export interface ApiSnapshot {
  /**
   * Snapshot schema version.
   * Keep this stable and bump only with breaking schema changes.
   */
  version: 1;
  /**
   * ISO timestamp.
   *
   * For determinism, generators should prefer SOURCE_DATE_EPOCH if present.
   */
  generatedAt: string;
  /**
   * Runtime profile used to build the registry snapshot (e.g. "default").
   */
  profile: string;
  endpoints: Array<{
    id: string; // e.g. "tasks.list"
    pattern: ApiSnapshotPattern;
    summary?: string;
    description?: string;
    args: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
      cli?: { flag?: string; repeatable?: boolean };
    }>;
    returns?: { type: string; description?: string };
  }>;
}


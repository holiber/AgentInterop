export type ApiSnapshotPattern = "unary" | "serverStream";

export interface ApiSnapshot {
  version: 1;
  generatedAt: string;
  profile: string;
  endpoints: Array<{
    id: string; // e.g. "chats.send"
    pattern: ApiSnapshotPattern;
    internal?: boolean;
    args: Array<{
      name: string;
      type: "string" | "boolean" | "string[]";
      required: boolean;
      description?: string;
      cli?: {
        flag?: `--${string}`;
        repeatable?: boolean;
        aliases?: Array<`--${string}`>;
        positionalIndex?: number;
      };
    }>;
    summary?: string;
    description?: string;
    returns?: { type: string; description?: string };
  }>;
}


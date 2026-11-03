export interface AssistantAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: AssistantAttachment[];
}

export interface AssistantThreadSummary {
  id: string;
  title: string;
  updatedAt: string;
  folderId?: string;
}

export interface AssistantThread extends AssistantThreadSummary {
  messages: AssistantMessage[];
}

export interface AssistantSendInput {
  threadId?: string;
  clientMessageId: string;
  text: string;
  model: string;
  plugins: string[];
  /** Extended thinking switched on in the model picker. Absent means off. */
  thinking?: boolean;
  /** How hard to think; only sent together with `thinking: true`. */
  effort?: "low" | "medium" | "high";
  folderId?: string;
  attachments: AssistantAttachment[];
}

export interface AssistantSendResult {
  thread: AssistantThread;
  requestId?: string;
}

export interface AssistantIntegration {
  id: string;
  name: string;
  connected: boolean;
}

/** Server-owned history and replies. No method generates a reply in the browser. */
export interface AssistantChatApi {
  readonly remote: boolean;
  list(workspaceId: string, signal?: AbortSignal): Promise<AssistantThreadSummary[]>;
  get(workspaceId: string, threadId: string, signal?: AbortSignal): Promise<AssistantThread>;
  send(workspaceId: string, input: AssistantSendInput, signal?: AbortSignal): Promise<AssistantSendResult>;
  cancel(workspaceId: string, threadId: string, requestId: string, signal?: AbortSignal): Promise<void>;
  upload(workspaceId: string, file: File, signal?: AbortSignal): Promise<AssistantAttachment>;
  remove(workspaceId: string, threadId: string, signal?: AbortSignal): Promise<void>;
  integrations(workspaceId: string, signal?: AbortSignal): Promise<AssistantIntegration[]>;
  connect(workspaceId: string, integrationId: string, signal?: AbortSignal): Promise<{ authorizationUrl: string }>;
}

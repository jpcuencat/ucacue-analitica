// Tipos mínimos para mensajes y tool calls del agente LangGraph

export type AnyMessage = {
  id?: string;
  type?: string;
  role?: string;
  name?: string;
  content?: unknown;
  text?: string;
  tool_call_id?: string;
  tool_calls?: Array<{ id?: string; name?: string; args?: unknown }>;
};

export type ThreadMeta = {
  id: string;
  title: string;
  createdAt: string; // ISO 8601
};

export type ToolCall = {
  name?: string;
  callId?: string;
  id?: string;
  status?: "running" | "finished" | "error" | string;
  input?: unknown;
  args?: unknown;
  output?: unknown;
  error?: unknown;
  call?: { id?: string; name?: string; args?: unknown };
  result?: unknown;
};

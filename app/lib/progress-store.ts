/**
 * In-memory progress store for tracking S-DOS workflow execution.
 * For production, consider using Redis or a database.
 */

export interface AgentProgress {
  step: number;
  agent: string;
  status: "pending" | "running" | "completed" | "error";
  description: string;
  detail?: string;
  timestamp?: string;
  data?: any; // Phase-specific data from n8n
}

export interface SessionProgress {
  sessionId: string;
  createdAt: string;
  currentStep: number;
  agents: AgentProgress[];
  listeners: Set<(data: AgentProgress) => void>;
}

// In-memory store - survives across requests in development
// In production with serverless, consider Redis/database
const progressStore = new Map<string, SessionProgress>();

// Cleanup old sessions after 10 minutes
const SESSION_TTL_MS = 10 * 60 * 1000;

function cleanupOldSessions() {
  const now = Date.now();
  for (const [sessionId, session] of progressStore.entries()) {
    const age = now - new Date(session.createdAt).getTime();
    if (age > SESSION_TTL_MS) {
      progressStore.delete(sessionId);
    }
  }
}

// Run cleanup every 2 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupOldSessions, 2 * 60 * 1000);
}

const DEFAULT_AGENTS: Omit<AgentProgress, "timestamp">[] = [
  {
    step: 1,
    agent: "Vision Extractor (GPT-4o)",
    status: "pending",
    description: "Extracting technical parameters from blueprint",
    detail: "Waiting to start...",
  },
  {
    step: 2,
    agent: "Perplexity Researcher",
    status: "pending",
    description: "Retrieving ISO/ASTM compliance standards",
    detail: "Waiting to start...",
  },
  {
    step: 3,
    agent: "Design Optimizer (GPT-4o)",
    status: "pending",
    description: "Analyzing compliance and generating optimization proposal",
    detail: "Waiting to start...",
  },
];

export function initializeSession(sessionId: string): SessionProgress {
  const session: SessionProgress = {
    sessionId,
    createdAt: new Date().toISOString(),
    currentStep: 0,
    agents: DEFAULT_AGENTS.map((a) => ({ ...a })),
    listeners: new Set(),
  };
  progressStore.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): SessionProgress | undefined {
  return progressStore.get(sessionId);
}

export function updateProgress(
  sessionId: string,
  step: number,
  status: AgentProgress["status"],
  detail?: string,
  data?: any
): AgentProgress | null {
  const session = progressStore.get(sessionId);
  if (!session) {
    return null;
  }

  const agentIndex = step - 1;
  if (agentIndex < 0 || agentIndex >= session.agents.length) {
    return null;
  }

  const agent = session.agents[agentIndex];
  agent.status = status;
  agent.timestamp = new Date().toISOString();
  if (detail) {
    agent.detail = detail;
  }
  if (data) {
    agent.data = data;
  }

  session.currentStep = step;

  // Notify all SSE listeners
  for (const listener of session.listeners) {
    try {
      listener(agent);
    } catch {
      // Listener might have disconnected
      session.listeners.delete(listener);
    }
  }

  return agent;
}

export function markAgentRunning(
  sessionId: string,
  step: number,
  detail?: string,
  data?: any
): AgentProgress | null {
  return updateProgress(sessionId, step, "running", detail ?? "Processing...", data);
}

export function markAgentCompleted(
  sessionId: string,
  step: number,
  detail?: string,
  data?: any
): AgentProgress | null {
  return updateProgress(sessionId, step, "completed", detail, data);
}

export function markAgentError(
  sessionId: string,
  step: number,
  detail?: string
): AgentProgress | null {
  return updateProgress(sessionId, step, "error", detail ?? "An error occurred");
}

export function addListener(
  sessionId: string,
  callback: (data: AgentProgress) => void
): boolean {
  const session = progressStore.get(sessionId);
  if (!session) {
    return false;
  }
  session.listeners.add(callback);
  return true;
}

export function removeListener(
  sessionId: string,
  callback: (data: AgentProgress) => void
): void {
  const session = progressStore.get(sessionId);
  if (session) {
    session.listeners.delete(callback);
  }
}

export function deleteSession(sessionId: string): void {
  progressStore.delete(sessionId);
}

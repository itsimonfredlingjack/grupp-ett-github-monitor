/**
 * Agentic Loop Monitor — Cloudflare Worker
 *
 * REST API that mirrors the Flask monitor endpoints.
 * State is persisted in KV. Frontend polls every 2s.
 *
 * Endpoints:
 *   GET  /api/monitor/state   — current state snapshot
 *   POST /api/monitor/state   — update node (from hooks)
 *   POST /api/monitor/task    — update task info
 *   POST /api/monitor/reset   — reset all state
 *   GET  /health              — health check
 */

export interface Env {
  MONITOR_KV: KVNamespace;
  API_SECRET?: string;
}

const KV_KEY = "monitor:state";

const VALID_NODES = new Set(["jira", "claude", "github", "jules", "actions"]);

interface WorkflowNode {
  active: boolean;
  last_active: string | null;
  message: string;
}

interface TaskInfo {
  title: string;
  status: string;
  start_time: string | null;
}

interface MonitorState {
  current_node: string | null;
  nodes: Record<string, WorkflowNode>;
  event_log: Array<{ timestamp: string; node: string; message: string }>;
  task_info: TaskInfo;
}

function freshState(): MonitorState {
  const nodes: Record<string, WorkflowNode> = {};
  for (const id of VALID_NODES) {
    nodes[id] = { active: false, last_active: null, message: "" };
  }
  return {
    current_node: null,
    nodes,
    event_log: [],
    task_info: { title: "Waiting for task...", status: "idle", start_time: null },
  };
}

function now(): string {
  return new Date().toISOString();
}

async function getState(kv: KVNamespace): Promise<MonitorState> {
  const raw = await kv.get(KV_KEY);
  if (!raw) return freshState();
  try {
    return JSON.parse(raw) as MonitorState;
  } catch {
    return freshState();
  }
}

async function putState(kv: KVNamespace, state: MonitorState): Promise<void> {
  await kv.put(KV_KEY, JSON.stringify(state));
}

function cors(headers?: Record<string, string>): Headers {
  const h = new Headers(headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Content-Type", "application/json");
  return h;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}

function validateAuth(request: Request, env: Env): boolean {
  if (!env.API_SECRET) return true;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.API_SECRET}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health
    if (path === "/health" && request.method === "GET") {
      return json({ status: "healthy", timestamp: now(), runtime: "cloudflare-worker" });
    }

    // Root
    if (path === "/" && request.method === "GET") {
      return json({
        message: "Grupp Ett Monitor (Cloudflare Worker)",
        dashboard: "https://grupp-ett-monitor.pages.dev",
        api: "/api/monitor/state",
      });
    }

    // --- Monitor API ---

    // GET state
    if (path === "/api/monitor/state" && request.method === "GET") {
      const state = await getState(env.MONITOR_KV);
      return json(state);
    }

    // POST state (update node)
    if (path === "/api/monitor/state" && request.method === "POST") {
      if (!validateAuth(request, env)) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }

      let data: Record<string, string>;
      try {
        data = await request.json();
      } catch {
        return json({ success: false, error: "Invalid JSON" }, 400);
      }

      const node = (data.node || "").toLowerCase();
      const stateStr = (data.state || "active").toLowerCase();
      const message = (data.message || "").slice(0, 200);

      if (!VALID_NODES.has(node)) {
        return json(
          { success: false, error: `Invalid node: ${node}. Must be one of ${[...VALID_NODES].join(", ")}` },
          400
        );
      }

      const state = await getState(env.MONITOR_KV);
      const isActive = stateStr === "active";

      // Deactivate previous node
      if (isActive && state.current_node && state.current_node !== node) {
        state.nodes[state.current_node].active = false;
      }

      // Update node
      state.nodes[node].active = isActive;
      if (isActive) {
        state.nodes[node].last_active = now();
        state.current_node = node;
      }
      state.nodes[node].message = message;

      // Event log (max 100)
      state.event_log.push({ timestamp: now(), node, message });
      if (state.event_log.length > 100) {
        state.event_log = state.event_log.slice(-100);
      }

      await putState(env.MONITOR_KV, state);
      return json({ success: true, current_state: state });
    }

    // POST task
    if (path === "/api/monitor/task" && request.method === "POST") {
      if (!validateAuth(request, env)) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }

      let data: Record<string, string>;
      try {
        data = await request.json();
      } catch {
        return json({ success: false, error: "Invalid JSON" }, 400);
      }

      const state = await getState(env.MONITOR_KV);
      const action = data.action;

      if (action === "start") {
        const title = data.title || `Task ${data.task_id || ""}`;
        state.task_info = { title: title.slice(0, 100), status: "running", start_time: now() };
      } else if (action === "complete") {
        state.task_info.status = "completed";
      } else {
        if (data.title) state.task_info.title = data.title.slice(0, 100);
        if (data.status) state.task_info.status = data.status;
        if (data.status === "running" && !data.start_time) {
          state.task_info.start_time = now();
        } else if (data.start_time) {
          state.task_info.start_time = data.start_time;
        }
      }

      await putState(env.MONITOR_KV, state);
      return json({ success: true, current_state: state });
    }

    // POST reset
    if (path === "/api/monitor/reset" && request.method === "POST") {
      if (!validateAuth(request, env)) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }

      const state = freshState();
      await putState(env.MONITOR_KV, state);
      return json({ success: true, message: "Monitoring state reset", current_state: state });
    }

    return json({ error: "Not found" }, 404);
  },
};

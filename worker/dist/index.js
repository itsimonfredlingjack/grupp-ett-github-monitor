// src/index.ts
var KV_KEY = "monitor:state";
var VALID_NODES = /* @__PURE__ */ new Set(["jira", "claude", "github", "jules", "actions"]);
function freshState() {
  const nodes = {};
  for (const id of VALID_NODES) {
    nodes[id] = { active: false, last_active: null, message: "" };
  }
  return {
    current_node: null,
    nodes,
    event_log: [],
    task_info: { title: "Waiting for task...", status: "idle", start_time: null }
  };
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
async function getState(kv) {
  const raw = await kv.get(KV_KEY);
  if (!raw)
    return freshState();
  try {
    return JSON.parse(raw);
  } catch {
    return freshState();
  }
}
async function putState(kv, state) {
  await kv.put(KV_KEY, JSON.stringify(state));
}
function cors(headers) {
  const h = new Headers(headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  h.set("Content-Type", "application/json");
  return h;
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}
function validateAuth(request, env) {
  if (!env.API_SECRET)
    return true;
  const auth = request.headers.get("Authorization");
  return auth === `Bearer ${env.API_SECRET}`;
}
var src_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/health" && request.method === "GET") {
      return json({ status: "healthy", timestamp: now(), runtime: "cloudflare-worker" });
    }
    if (path === "/" && request.method === "GET") {
      return json({
        message: "Grupp Ett Monitor (Cloudflare Worker)",
        dashboard: "https://ralph-monitor.pages.dev/monitor",
        api: "/api/monitor/state"
      });
    }
    if (path === "/api/monitor/state" && request.method === "GET") {
      const state = await getState(env.MONITOR_KV);
      return json(state);
    }
    if (path === "/api/monitor/state" && request.method === "POST") {
      if (!validateAuth(request, env)) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }
      let data;
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
      if (isActive && state.current_node && state.current_node !== node) {
        state.nodes[state.current_node].active = false;
      }
      state.nodes[node].active = isActive;
      if (isActive) {
        state.nodes[node].last_active = now();
        state.current_node = node;
      }
      state.nodes[node].message = message;
      state.event_log.push({ timestamp: now(), node, message });
      if (state.event_log.length > 100) {
        state.event_log = state.event_log.slice(-100);
      }
      await putState(env.MONITOR_KV, state);
      return json({ success: true, current_state: state });
    }
    if (path === "/api/monitor/task" && request.method === "POST") {
      if (!validateAuth(request, env)) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }
      let data;
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
        if (data.title)
          state.task_info.title = data.title.slice(0, 100);
        if (data.status)
          state.task_info.status = data.status;
        if (data.status === "running" && !data.start_time) {
          state.task_info.start_time = now();
        } else if (data.start_time) {
          state.task_info.start_time = data.start_time;
        }
      }
      await putState(env.MONITOR_KV, state);
      return json({ success: true, current_state: state });
    }
    if (path === "/api/monitor/reset" && request.method === "POST") {
      if (!validateAuth(request, env)) {
        return json({ success: false, error: "Unauthorized" }, 401);
      }
      const state = freshState();
      await putState(env.MONITOR_KV, state);
      return json({ success: true, message: "Monitoring state reset", current_state: state });
    }
    return json({ error: "Not found" }, 404);
  }
};
export {
  src_default as default
};

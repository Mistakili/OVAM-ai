const DEFAULT_MODEL = "gemma-4-26b-a4b-it";

export function visibleSpeech(text) {
  return String(text || "").replace(/<thought>[\s\S]*?<\/thought>/gi, "").trim();
}

export function createSpeechFilter() {
  let held = "";
  let mode = "detect";
  return {
    push(chunk) {
      held += String(chunk || "");
      let out = "";
      while (held) {
        if (mode === "detect") {
          const trimmed = held.trimStart();
          if (!trimmed) return out;
          if (trimmed.startsWith("<thought>")) {
            held = trimmed;
            mode = "thought";
            continue;
          }
          if ("<thought>".startsWith(trimmed) && trimmed.startsWith("<")) return out;
          held = trimmed;
          mode = "speak";
          continue;
        }
        if (mode === "thought") {
          const end = held.toLowerCase().indexOf("</thought>");
          if (end < 0) return out;
          held = held.slice(end + "</thought>".length);
          mode = "speak";
          continue;
        }
        out += held;
        held = "";
      }
      return out;
    },
    flush() {
      if (mode !== "speak") {
        held = "";
        return "";
      }
      const out = held;
      held = "";
      return out;
    }
  };
}

function cleanToolCalls(calls) {
  if (!Array.isArray(calls)) return [];
  return calls.map((call) => ({
    index: call.index,
    id: call.id,
    type: call.type || "function",
    function: call.function
  }));
}

async function readJson(req) {
  if (typeof req.body === "string") return req.body ? JSON.parse(req.body) : {};
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString("utf8") || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function authorized(req) {
  const expected = process.env.GEMMA_VOICE_TOKEN;
  if (!expected) return true;
  const header = String(req.headers.authorization || req.headers.Authorization || "").trim();
  return header === "Bearer " + expected || header === expected;
}

function cleanMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => {
    const next = { role: message.role };
    if (typeof message.content === "string") next.content = message.content;
    else if (message.content == null) next.content = null;
    else next.content = JSON.stringify(message.content);
    if (message.tool_call_id) next.tool_call_id = message.tool_call_id;
    if (message.name && message.role === "tool") next.name = message.name;
    if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
      next.tool_calls = message.tool_calls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.function?.name || call.name,
          arguments: typeof call.function?.arguments === "string" ? call.function.arguments : JSON.stringify(call.function?.arguments || call.arguments || {})
        }
      }));
    }
    return next;
  });
}

function cleanTools(tools) {
  if (!Array.isArray(tools)) return undefined;
  return tools.map((tool) => {
    const source = tool.function || tool;
    return {
      type: "function",
      function: {
        name: source.name,
        description: source.description || "",
        parameters: source.parameters || { type: "object", properties: {} }
      }
    };
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  if (!process.env.GEMINI_API_KEY) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "GEMINI_API_KEY is not configured" }));
    return;
  }
  if (!authorized(req)) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  let body;
  try {
    body = await readJson(req);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON" }));
    return;
  }

  const model = process.env.GEMMA_MODEL || DEFAULT_MODEL;
  const upstreamBody = {
    model,
    messages: cleanMessages(body.messages),
    max_tokens: Math.max(Number(body.max_tokens) || 0, 1024),
    stream: Boolean(body.stream)
  };
  const tools = cleanTools(body.tools);
  if (tools?.length) upstreamBody.tools = tools;
  if (typeof body.tool_choice === "string") upstreamBody.tool_choice = body.tool_choice;
  else if (body.tool_choice?.function?.name) upstreamBody.tool_choice = { type: "function", function: { name: body.tool_choice.function.name } };
  const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      authorization: "Bearer " + process.env.GEMINI_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(upstreamBody)
  });
  if (!upstream.ok) {
    const tools = Array.isArray(body.tools) ? body.tools.map((tool) => tool.function?.name || tool.name || tool.type) : [];
    console.error("gemma-shape", JSON.stringify({
      keys: Object.keys(body),
      stream: Boolean(body.stream),
      roles: Array.isArray(body.messages) ? body.messages.map((message) => message.role) : [],
      tools
    }));
  }

  if (!body.stream) {
    const raw = await upstream.text();
    if (!upstream.ok) {
      console.error("gemma-upstream", upstream.status, raw.slice(0, 800));
      res.statusCode = upstream.status;
      res.setHeader("Content-Type", "application/json");
      res.end(raw);
      return;
    }
    const data = JSON.parse(raw);
    const message = data.choices?.[0]?.message;
    if (message) {
      message.content = visibleSpeech(message.content);
      if (message.tool_calls) message.tool_calls = cleanToolCalls(message.tool_calls);
      delete message.extra_content;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
    return;
  }

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text();
    console.error("gemma-upstream", upstream.status, raw.slice(0, 800));
    res.statusCode = upstream.status || 502;
    res.setHeader("Content-Type", "application/json");
    res.end(raw || JSON.stringify({ error: "Gemma stream failed" }));
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  const filter = createSpeechFilter();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  const send = (payload) => res.write("data: " + JSON.stringify(payload) + "\n\n");
  const emitText = (text) => {
    if (!text) return;
    send({ id: "gemma", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let chunk;
      try { chunk = JSON.parse(data); } catch { continue; }
      const choice = chunk.choices?.[0] || {};
      const delta = choice.delta || {};
      const toolCalls = cleanToolCalls(delta.tool_calls);
      if (toolCalls.length) {
        send({ id: chunk.id || "gemma", object: "chat.completion.chunk", choices: [{ index: 0, delta: { tool_calls: toolCalls }, finish_reason: null }] });
      }
      if (delta.content) emitText(filter.push(delta.content));
      if (choice.finish_reason) {
        emitText(filter.flush());
        send({ id: chunk.id || "gemma", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason }] });
      }
    }
  }
  emitText(filter.flush());
  res.end("data: [DONE]\n\n");
}

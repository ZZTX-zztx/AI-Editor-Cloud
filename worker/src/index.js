/**
 * AI Code Editor — Cloudflare Worker 后端
 *
 * 基于 Cloudflare Workers AI（AI binding）提供 3 个 AI 辅助接口：
 *   POST /api/complete  代码补全：根据光标位置之前的代码续写
 *   POST /api/explain   代码解释：解释当前选中/全文代码
 *   POST /api/generate  代码生成：根据自然语言需求生成代码
 *   GET  /api/health    健康检查
 *
 * 默认模型：@cf/meta/llama-3.1-8b-instruct
 * 可通过环境变量 AI_MODEL 覆盖（wrangler.toml [vars] 或 .dev.vars）。
 */

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

function model(env) {
  return (env && env.AI_MODEL) || DEFAULT_MODEL;
}

/** 兼容不同模型返回格式，取出文本 */
function firstText(result) {
  if (!result) return '';
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result.map((t) => (typeof t === 'string' ? t : t.response || t.text || '')).join('');
  }
  return result.response ?? result.result ?? result.output ?? result.text ?? '';
}

/** 调用 Workers AI 的公共封装，捕获模型层面的错误并转成友好信息 */
async function runAI(env, messages, options = {}) {
  const m = model(env);
  try {
    const result = await env.AI.run(m, {
      messages,
      max_tokens: options.max_tokens ?? 512,
      temperature: options.temperature ?? 0.3,
    });
    return { ok: true, text: firstText(result) };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    // 模型不可用/账号无权限时的常见错误提示
    if (/not found|no such model|unknown model/i.test(msg)) {
      return { ok: false, error: `模型 ${m} 不可用，请在 Cloudflare Dashboard 确认该模型已开通，或通过 AI_MODEL 换成其他模型（如 @cf/qwen/qwen1.5-14b-chat-awq）` };
    }
    return { ok: false, error: msg };
  }
}

/* ---------- Prompt 构建 ---------- */

function buildCompletePrompt(code, cursor, language) {
  const pos = typeof cursor === 'number' ? Math.max(0, Math.min(cursor, code.length)) : code.length;
  const before = code.slice(0, pos);
  const after = code.slice(pos);
  return [
    'You are an AI code completion assistant embedded in a code editor.',
    `The user is writing ${language} code. Your job: continue the code starting at the cursor.`,
    'Rules:',
    '- Output ONLY the code that should be inserted at the cursor.',
    '- Do NOT repeat any code that already exists before the cursor.',
    '- Do NOT wrap output in markdown code fences, do NOT add explanations.',
    '- Match the existing indentation, naming style and language idioms.',
    '',
    'Code before cursor:',
    '```',
    before,
    '```',
    after
      ? 'Code after cursor (DO NOT output this part, just keep it intact when you continue):\n```\n' + after + '\n```'
      : '',
    '',
    'Completion:',
  ].join('\n');
}

function buildExplainPrompt(code, language) {
  return [
    'You are a senior developer explaining code to a learner.',
    `Explain the following ${language} code.`,
    'Cover: 1) what it does overall, 2) key functions/logic, 3) potential issues or improvements.',
    'Be concise. Use Markdown bullets if helpful.',
    '',
    'Code:',
    '```',
    code || '(empty)',
    '```',
    '',
    'Explanation:',
  ].join('\n');
}

function buildGeneratePrompt(promptText, language) {
  return [
    `You are a coding assistant. Write ${language} code to fulfill the user's request.`,
    'Rules:',
    '- Output ONLY the code, no extra explanation.',
    '- Wrap the code in a single ``` code block when it is longer than a few lines.',
    '- Follow common best practices for the target language.',
    '',
    `Request: ${promptText}`,
    '',
    'Code:',
  ].join('\n');
}

/* ---------- 接口处理 ---------- */

async function handleComplete(request, env) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.code !== 'string') return json({ error: '缺少 code 字段（编辑器当前代码）' }, 400);
  const language = body.language || 'javascript';
  const cursor = Number.isFinite(body.cursor) ? body.cursor : body.code.length;

  const prompt = buildCompletePrompt(body.code, cursor, language);
  const { ok, text, error } = await runAI(env, [{ role: 'user', content: prompt }], {
    max_tokens: 300,
    temperature: 0.15,
  });
  if (!ok) return json({ error }, 502);
  // 去除可能出现的 markdown 代码块围栏与多余空行
  const completion = text.replace(/^```[a-zA-Z0-9]*\s*\n?/, '').replace(/\n?```\s*$/, '').replace(/\s+$/, '');
  return json({ completion, model: model(env) });
}

async function handleExplain(request, env) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.code !== 'string') return json({ error: '缺少 code 字段' }, 400);
  const language = body.language || 'javascript';
  const prompt = buildExplainPrompt(body.code, language);
  const { ok, text, error } = await runAI(env, [{ role: 'user', content: prompt }], {
    max_tokens: 900,
    temperature: 0.3,
  });
  if (!ok) return json({ error }, 502);
  return json({ explanation: text, model: model(env) });
}

async function handleGenerate(request, env) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.prompt !== 'string' || !body.prompt.trim()) return json({ error: '缺少 prompt 字段（生成需求）' }, 400);
  const language = body.language || 'javascript';
  const prompt = buildGeneratePrompt(body.prompt.trim(), language);
  const { ok, text, error } = await runAI(env, [{ role: 'user', content: prompt }], {
    max_tokens: 1200,
    temperature: 0.4,
  });
  if (!ok) return json({ error }, 502);
  return json({ code: text, model: model(env) });
}

/* ---------- 入口 ---------- */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health') {
        return json({ ok: true, ai: Boolean(env.AI), model: model(env) });
      }
      if (url.pathname === '/api/complete' && request.method === 'POST') return await handleComplete(request, env);
      if (url.pathname === '/api/explain' && request.method === 'POST') return await handleExplain(request, env);
      if (url.pathname === '/api/generate' && request.method === 'POST') return await handleGenerate(request, env);
      return json({ error: 'Not Found', paths: ['/api/health', '/api/complete', '/api/explain', '/api/generate'] }, 404);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};

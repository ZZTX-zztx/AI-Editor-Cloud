/**
 * AI Code Editor — Cloudflare Worker 后端
 *
 * 纯 API 后端：仅提供 AI 接口（代码补全 / 解释 / 生成），前端为本地程序
 * （项目根目录 index.html，独立打开），通过 CORS 跨域访问本服务的接口。
 *
 * 路由：
 *   GET  /api/health          健康检查
 *   POST /api/complete        代码补全
 *   POST /api/explain         代码解释
 *   POST /api/generate        代码生成
 *   POST /api/chat            聊天对话（messages 数组，对齐模板 /api/chat）
 *   GET  /api/vars[/app|/win] 版本/更新信息（对齐模板 /api/vars）
 */
import {
	Env,
	CompleteRequest,
	ExplainRequest,
	GenerateRequest,
	ChatMessage,
} from "./types";

// Default model ID for Workers AI.
// https://developers.cloudflare.com/workers-ai/models/
const DEFAULT_MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Default system prompt（与模板 src/index.ts 保持一致，/api/chat 自动注入）
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

// CORS headers so the frontend can be hosted separately from the Worker.
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Max-Age": "86400",
};

/** Serialize a JSON response with standard content-type + CORS headers. */
function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-cache",
			...CORS_HEADERS,
		},
	});
}

/** Resolve the model id, preferring the environment override. */
function modelId(env: Env): string {
	return env.AI_MODEL?.trim() || DEFAULT_MODEL_ID;
}

/** Normalize model output: some models return { response }, others { result }/{ output }/{ text }. */
function extractText(result: unknown): string {
	if (!result) return "";
	if (typeof result === "string") return result;
	if (Array.isArray(result)) {
		return result
			.map((t) => (typeof t === "string" ? t : (t as Record<string, unknown>).response ?? (t as Record<string, unknown>).text ?? ""))
			.join("");
	}
	const r = result as Record<string, unknown>;
	return String(r.response ?? r.result ?? r.output ?? r.text ?? "");
}

/** Call Workers AI with error normalization. */
async function runAI(
	env: Env,
	messages: ChatMessage[],
	options: { max_tokens?: number; temperature?: number } = {},
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
	const model = modelId(env);
	try {
		// 模型经 vars 动态可配，这里走 Ai.run 的 (model: string, inputs: Record<string, unknown>) 重载
		const inputs: Record<string, unknown> = {
			messages,
			max_tokens: options.max_tokens ?? 512,
			temperature: options.temperature ?? 0.3,
		};
		const result = await env.AI.run(model, inputs);
		return { ok: true, text: extractText(result) };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/not found|no such model|unknown model/i.test(message)) {
			return {
				ok: false,
				error: `模型 ${model} 不可用，请在 Cloudflare Dashboard 确认已开通该模型，或通过 AI_MODEL 更换模型（如 @cf/qwen/qwen1.5-14b-chat-awq）`,
			};
		}
		return { ok: false, error: message };
	}
}

/* ---------- Prompt 构建 ---------- */

function buildCompletePrompt(code: string, cursor: number, language: string): string {
	const pos = Math.max(0, Math.min(cursor, code.length));
	const before = code.slice(0, pos);
	const after = code.slice(pos);
	const lines = [
		"You are an AI code completion assistant embedded in a code editor.",
		`The user is writing ${language} code. Your job: continue the code starting at the cursor.`,
		"Rules:",
		"- Output ONLY the code that should be inserted at the cursor.",
		"- Do NOT repeat any code that already exists before the cursor.",
		"- Do NOT wrap output in markdown code fences, do NOT add explanations.",
		"- Match the existing indentation, naming style and language idioms.",
		"",
		"Code before cursor:",
		"```",
		before,
		"```",
	];
	if (after) {
		lines.push(
			"Code after cursor (DO NOT output this part, just keep it intact when you continue):",
			"```",
			after,
			"```",
		);
	}
	lines.push("", "Completion:");
	return lines.join("\n");
}

function buildExplainPrompt(code: string, language: string): string {
	return [
		"You are a senior developer explaining code to a learner.",
		`Explain the following ${language} code.`,
		"Cover: 1) what it does overall, 2) key functions/logic, 3) potential issues or improvements.",
		"Be concise. Use Markdown bullets if helpful.",
		"",
		"Code:",
		"```",
		code || "(empty)",
		"```",
		"",
		"Explanation:",
	].join("\n");
}

function buildGeneratePrompt(prompt: string, language: string): string {
	return [
		`You are a coding assistant. Write ${language} code to fulfill the user's request.`,
		"Rules:",
		"- Output ONLY the code, no extra explanation.",
		"- Wrap the code in a single ``` code block when it is longer than a few lines.",
		"- Follow common best practices for the target language.",
		"",
		`Request: ${prompt}`,
		"",
		"Code:",
	].join("\n");
}

/* ---------- 接口处理 ---------- */

async function handleComplete(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => ({}))) as Partial<CompleteRequest>;
	if (typeof body.code !== "string") {
		return json({ error: "缺少 code 字段（编辑器当前代码）" }, 400);
	}
	const language = body.language || "javascript";
	const cursor = typeof body.cursor === "number" ? body.cursor : body.code.length;

	const result = await runAI(
		env,
		[{ role: "user", content: buildCompletePrompt(body.code, cursor, language) }],
		{ max_tokens: 300, temperature: 0.15 },
	);
	if (!result.ok) return json({ error: result.error }, 502);

	const completion = result.text
		.replace(/^```[a-zA-Z0-9]*\s*\n?/, "")
		.replace(/\n?```\s*$/, "")
		.replace(/\s+$/, "");
	return json({ completion, model: modelId(env) });
}

async function handleExplain(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => ({}))) as Partial<ExplainRequest>;
	if (typeof body.code !== "string") {
		return json({ error: "缺少 code 字段" }, 400);
	}
	const language = body.language || "javascript";

	const result = await runAI(
		env,
		[{ role: "user", content: buildExplainPrompt(body.code, language) }],
		{ max_tokens: 900, temperature: 0.3 },
	);
	if (!result.ok) return json({ error: result.error }, 502);

	return json({ explanation: result.text, model: modelId(env) });
}

async function handleGenerate(request: Request, env: Env): Promise<Response> {
	const body = (await request.json().catch(() => ({}))) as Partial<GenerateRequest>;
	if (typeof body.prompt !== "string" || !body.prompt.trim()) {
		return json({ error: "缺少 prompt 字段（生成需求）" }, 400);
	}
	const language = body.language || "javascript";

	const result = await runAI(
		env,
		[{ role: "user", content: buildGeneratePrompt(body.prompt.trim(), language) }],
		{ max_tokens: 1200, temperature: 0.4 },
	);
	if (!result.ok) return json({ error: result.error }, 502);

	return json({ code: result.text, model: modelId(env) });
}

/* ---------- /api/chat（对齐模板 src/index.ts 的聊天接口，SSE 流式） ---------- */

async function handleChat(request: Request, env: Env): Promise<Response> {
	try {
		// 与模板一致：请求体为 { messages: ChatMessage[] }，缺省为空数组
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// 与模板一致：消息中无 system 时自动注入默认 system prompt
		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		// 与模板一致：max_tokens 1024、stream: true，直接透传 Workers AI 的 SSE 流。
		const stream = (await env.AI.run(
			modelId(env) as string,
			{
				messages,
				max_tokens: 1024,
				stream: true,
			} as AiTextGenerationInput & { stream: true },
		)) as unknown as ReadableStream;
		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
				...CORS_HEADERS,
			},
		});
	} catch (error) {
		// 与模板一致：记录错误并返回 500
		console.error("Error processing chat request:", error);
		return json({ error: "Failed to process request" }, 500);
	}
}

/**
 * Handles app version / update info requests.
 * Returns platform-specific vars configured in wrangler.jsonc so clients
 * can check for updates. (与模板 src/index.ts 的 handleVarsRequest 一致)
 * - platform "app": Android (APP_*) vars
 * - platform "win": Windows (WIN_*) vars
 */
function handleVarsRequest(env: Env, platform: "app" | "win"): Response {
	if (platform === "win") {
		return json({
			WIN_VERSION_CODE: env.WIN_VERSION_CODE ?? "1",
			WIN_VERSION_NAME: env.WIN_VERSION_NAME ?? "1.0",
			WIN_DOWNLOAD_URL: env.WIN_DOWNLOAD_URL ?? "",
			WIN_CHANGELOG: env.WIN_CHANGELOG ?? "",
			WIN_FORCE_UPDATE: env.WIN_FORCE_UPDATE ?? "false",
		});
	}

	return json({
		APP_VERSION_CODE: env.APP_VERSION_CODE ?? "1",
		APP_VERSION_NAME: env.APP_VERSION_NAME ?? "1.0",
		APP_DOWNLOAD_URL: env.APP_DOWNLOAD_URL ?? "",
		APP_CHANGELOG: env.APP_CHANGELOG ?? "",
		APP_FORCE_UPDATE: env.APP_FORCE_UPDATE ?? "false",
		APP_MIN_SDK: env.APP_MIN_SDK ?? "24",
	});
}

/* ---------- Worker 入口 ---------- */

export default {
	/**
	 * Main request handler for the Worker.
	 */
	async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// 后端仅提供 API；前端为本地程序（项目根目录 index.html），不再由 Worker 托管静态资源
		if (!url.pathname.startsWith("/api/")) {
			return json({ error: "Not found. This Worker serves API only." }, 404);
		}

		// CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: CORS_HEADERS });
		}

		// API Routes
		if (url.pathname === "/api/health") {
			if (request.method === "GET") {
				return json({ ok: true, ai: Boolean(env.AI), model: modelId(env) });
			}
			return new Response("Method not allowed", { status: 405 });
		}

		if (url.pathname === "/api/complete") {
			if (request.method === "POST") return handleComplete(request, env);
			return new Response("Method not allowed", { status: 405 });
		}

		if (url.pathname === "/api/explain") {
			if (request.method === "POST") return handleExplain(request, env);
			return new Response("Method not allowed", { status: 405 });
		}

		if (url.pathname === "/api/generate") {
			if (request.method === "POST") return handleGenerate(request, env);
			return new Response("Method not allowed", { status: 405 });
		}

		if (url.pathname === "/api/chat") {
			if (request.method === "POST") return handleChat(request, env);
			return new Response("Method not allowed", { status: 405 });
		}

		// 与模板一致：版本 / 更新信息接口（app 与 win 平台各自独立）
		if (url.pathname === "/api/vars" || url.pathname === "/api/vars/app") {
			if (request.method === "GET") {
				return handleVarsRequest(env, "app");
			}
			return new Response("Method not allowed", { status: 405 });
		}

		if (url.pathname === "/api/vars/win") {
			if (request.method === "GET") {
				return handleVarsRequest(env, "win");
			}
			return new Response("Method not allowed", { status: 405 });
		}

		// Handle 404 for unmatched API routes
		return json(
			{ error: "Not found", paths: ["/api/health", "/api/complete", "/api/explain", "/api/generate", "/api/chat", "/api/vars"] },
			404,
		);
	},
} satisfies ExportedHandler<Env>;

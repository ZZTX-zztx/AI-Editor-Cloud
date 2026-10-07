/**
 * LLM Chat Application Template
 *
 * A simple chat application using Cloudflare Workers AI.
 * This template demonstrates how to implement an LLM-powered chat interface with
 * streaming responses using Server-Sent Events (SSE).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Default system prompt
const SYSTEM_PROMPT =
	"You are a helpful, friendly assistant. Provide concise and accurate responses.";

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname === "/api/chat") {
			// Handle POST requests for chat
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// Handle app version / update info
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

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		// Parse JSON request body
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// Add system prompt if not present
		if (!messages.some((msg) => msg.role === "system")) {
			messages.unshift({ role: "system", content: SYSTEM_PROMPT });
		}

		const inputs = {
			messages,
			max_tokens: 1024,
			stream: true,
		} satisfies AiTextGenerationInput & { stream: true };

		const stream = await env.AI.run<typeof MODEL_ID>(MODEL_ID, inputs, {
			// Uncomment to use AI Gateway
			// gateway: {
			//   id: "YOUR_GATEWAY_ID", // Replace with your AI Gateway ID
			//   skipCache: false,      // Set to true to bypass cache
			//   cacheTtl: 3600,        // Cache time-to-live in seconds
			// },
		});

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}

/**
 * Handles app version / update info requests.
 * Returns platform-specific vars configured in wrangler.jsonc so clients
 * can check for updates.
 * - platform "app": Android (APP_*) vars
 * - platform "win": Windows (WIN_*) vars
 */
function handleVarsRequest(env: Env, platform: "app" | "win"): Response {
	if (platform === "win") {
		return new Response(
			JSON.stringify({
				WIN_VERSION_CODE: env.WIN_VERSION_CODE ?? "1",
				WIN_VERSION_NAME: env.WIN_VERSION_NAME ?? "1.0",
				WIN_DOWNLOAD_URL: env.WIN_DOWNLOAD_URL ?? "",
				WIN_CHANGELOG: env.WIN_CHANGELOG ?? "",
				WIN_FORCE_UPDATE: env.WIN_FORCE_UPDATE ?? "false",
			}),
			{
				headers: {
					"content-type": "application/json; charset=utf-8",
					"cache-control": "no-cache",
				},
			},
		);
	}

	return new Response(
		JSON.stringify({
			APP_VERSION_CODE: env.APP_VERSION_CODE ?? "1",
			APP_VERSION_NAME: env.APP_VERSION_NAME ?? "1.0",
			APP_DOWNLOAD_URL: env.APP_DOWNLOAD_URL ?? "",
			APP_CHANGELOG: env.APP_CHANGELOG ?? "",
			APP_FORCE_UPDATE: env.APP_FORCE_UPDATE ?? "false",
			APP_MIN_SDK: env.APP_MIN_SDK ?? "24",
		}),
		{
			headers: {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-cache",
			},
		},
	);
}

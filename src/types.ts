/**
 * Type definitions for the AI Code Editor Worker.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Model ID for Workers AI, configurable via wrangler vars / .dev.vars.
	 */
	AI_MODEL: string;

	/**
	 * KV namespace for chat storage (aligned with template; reserved for future use).
	 */
	CHAT_KV?: KVNamespace;

	/**
	 * Chat room identifier (aligned with template; reserved for future use).
	 */
	ROOM_ID?: string;

	/**
	 * Maximum number of messages to retain (aligned with template; reserved for future use).
	 */
	MAX_MESSAGES?: string;

	/**
	 * Optional API key for authenticating requests (reserved, not enforced).
	 */
	API_KEY: string;

	/**
	 * App version code (integer as string). Compared with Android versionCode.
	 */
	APP_VERSION_CODE: string;

	/**
	 * App version name for display.
	 */
	APP_VERSION_NAME: string;

	/**
	 * APK download URL.
	 */
	APP_DOWNLOAD_URL: string;

	/**
	 * Update changelog text.
	 */
	APP_CHANGELOG: string;

	/**
	 * Whether the update is mandatory ("true" / "false").
	 */
	APP_FORCE_UPDATE: string;

	/**
	 * Android minimum SDK version.
	 */
	APP_MIN_SDK: string;

	/**
	 * Windows version code (integer as string).
	 */
	WIN_VERSION_CODE: string;

	/**
	 * Windows version name for display.
	 */
	WIN_VERSION_NAME: string;

	/**
	 * Windows download URL.
	 */
	WIN_DOWNLOAD_URL: string;

	/**
	 * Windows update changelog text.
	 */
	WIN_CHANGELOG: string;

	/**
	 * Whether the Windows update is mandatory ("true" / "false").
	 */
	WIN_FORCE_UPDATE: string;
}

/**
 * Represents a chat-style message fed to the LLM.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Input shape for non-streaming text generation calls.
 */
export interface AiTextGenerationInput {
	messages: ChatMessage[];
	max_tokens?: number;
	temperature?: number;
}

/**
 * Request body for POST /api/complete
 */
export interface CompleteRequest {
	code: string;
	cursor?: number;
	language?: string;
}

/**
 * Request body for POST /api/explain
 */
export interface ExplainRequest {
	code: string;
	language?: string;
}

/**
 * Request body for POST /api/generate
 */
export interface GenerateRequest {
	prompt: string;
	language?: string;
}

/**
 * Request body for POST /api/chat
 * 与模板 src/types.ts 的 ChatMessage 定义一致：
 * 发送方提交完整 messages 数组，由后端自动注入 system prompt。
 */
export interface ChatRequest {
	messages: ChatMessage[];
}

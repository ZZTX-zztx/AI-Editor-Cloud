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
	 * Optional API key for authenticating requests (reserved, not enforced).
	 */
	API_KEY: string;
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

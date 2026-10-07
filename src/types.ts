/**
 * Type definitions for the LLM chat application.
 */

export interface Env {
	/**
	 * Binding for the Workers AI API.
	 */
	AI: Ai;

	/**
	 * Binding for static assets.
	 */
	ASSETS: { fetch: (request: Request) => Promise<Response> };

	/**
	 * KV namespace for chat storage.
	 */
	CHAT_KV: KVNamespace;

	/**
	 * Chat room identifier.
	 */
	ROOM_ID: string;

	/**
	 * Maximum number of messages to retain.
	 */
	MAX_MESSAGES: string;

	/**
	 * Optional API key for authentication.
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
 * Represents a chat message.
 */
export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

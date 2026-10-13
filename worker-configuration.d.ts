/* eslint-disable */
// 本文件为精简占位版本，用于在运行 `wrangler types` 之前提供同名绑定类型。
// 运行 npm run cf-typegen 后会被完整的运行时类型声明覆盖。
// 完整版包含 workerd 运行时类型，并额外声明 Cloudflare.Env（此处省略以保持精简）。

interface Env {
	AI: Ai;
	AI_MODEL: string;
	API_KEY: string;
	APP_VERSION_CODE: string;
	APP_VERSION_NAME: string;
	APP_DOWNLOAD_URL: string;
	APP_CHANGELOG: string;
	APP_FORCE_UPDATE: string;
	APP_MIN_SDK: string;
	WIN_VERSION_CODE: string;
	WIN_VERSION_NAME: string;
	WIN_DOWNLOAD_URL: string;
	WIN_CHANGELOG: string;
	WIN_FORCE_UPDATE: string;
}

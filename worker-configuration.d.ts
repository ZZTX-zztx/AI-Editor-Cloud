/* eslint-disable */
// 本文件为精简占位版本，用于在运行 `wrangler types` 之前提供同名绑定类型。
// 运行 npm run cf-typegen 后会被完整的运行时类型声明覆盖。
// 完整版包含 workerd 运行时类型，并额外声明 Cloudflare.Env（此处省略以保持精简）。

interface Env {
	AI: Ai;
	AI_MODEL: string;
	API_KEY: string;
}

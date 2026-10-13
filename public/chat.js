/**
 * LLM Chat App Frontend
 *
 * 多会话管理 + 流式 SSE 响应 + localStorage 持久化 + Markdown渲染AI输出
 */
// ---------- DOM elements ----------
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const clearButton = document.getElementById("clear-btn");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const chatTitle = document.getElementById("chat-title");
const newChatBtn = document.getElementById("new-chat-btn");
const conversationList = document.getElementById("conversation-list");
const sidebar = document.getElementById("sidebar");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const menuBtn = document.getElementById("menu-btn");
const downloadButton = document.getElementById("download-btn");
const uploadFileBtn = document.getElementById("upload-file-btn");
const fileInput = document.getElementById("file-input");
// ---------- 常量 ----------
const STORAGE_KEY = "aichat_conversations";
const CURRENT_KEY = "aichat_current_id";
const WELCOME_MSG = "你好！我是 AI 聊天助手，请问有什么可以帮您？";
const TITLE_MAX_LEN = 24;
// ---------- State ----------
let conversations = [];
let currentId = null;
let isProcessing = false;
// ---------- 持久化 ----------
function loadConversations() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const data = JSON.parse(raw);
		return Array.isArray(data) ? data : [];
	} catch (e) {
		console.error("加载会话失败:", e);
		return [];
	}
}
function saveConversations() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
	} catch (e) {
		console.error("保存会话失败:", e);
	}
}
function saveCurrentId() {
	try {
		localStorage.setItem(CURRENT_KEY, currentId || "");
	} catch (e) {}
}
// ---------- 会话管理 ----------
function genId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function createConversation() {
	const conv = {
		id: genId(),
		title: "新对话",
		messages: [{ role: "assistant", content: WELCOME_MSG }],
		createdAt: Date.now(),
	};
	conversations.unshift(conv);
	currentId = conv.id;
	saveConversations();
	saveCurrentId();
	renderConversationList();
	renderMessages();
}
function getCurrentConversation() {
	return conversations.find((c) => c.id === currentId);
}
function switchConversation(id) {
	if (isProcessing) return;
	currentId = id;
	saveCurrentId();
	renderConversationList();
	renderMessages();
}
function deleteConversation(id) {
	if (isProcessing) return;
	const idx = conversations.findIndex((c) => c.id === id);
	if (idx === -1) return;
	conversations.splice(idx, 1);
	if (currentId === id) {
		if (conversations.length > 0) {
			currentId = conversations[0].id;
		} else {
			createConversation();
			return;
		}
	}
	saveConversations();
	saveCurrentId();
	renderConversationList();
	renderMessages();
}
function updateConversationTitle(conv) {
	const firstUser = conv.messages.find((m) => m.role === "user");
	if (firstUser) {
		let title = firstUser.content.slice(0, TITLE_MAX_LEN);
		if (firstUser.content.length > TITLE_MAX_LEN) title += "...";
		conv.title = title;
	}
}
// ---------- 渲染 ----------
function renderConversationList() {
	conversationList.innerHTML = "";
	for (const conv of conversations) {
		const item = document.createElement("div");
		item.className = "conv-item" + (conv.id === currentId ? " active" : "");
		item.dataset.id = conv.id;
		const title = document.createElement("span");
		title.className = "conv-title";
		title.textContent = conv.title;
		const delBtn = document.createElement("button");
		delBtn.className = "conv-delete";
		delBtn.title = "删除";
		delBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /></svg>`;
		delBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			deleteConversation(conv.id);
		});
		item.appendChild(title);
		item.appendChild(delBtn);
		item.addEventListener("click", () => switchConversation(conv.id));
		conversationList.appendChild(item);
	}
}
function renderMessages() {
	chatMessages.innerHTML = "";
	const conv = getCurrentConversation();
	if (!conv) {
		chatTitle.textContent = "AI Chat";
		return;
	}
	chatTitle.textContent = conv.title;
	for (const msg of conv.messages) {
		addMessageToChat(msg.role, msg.content);
	}
}
// ---------- 工具函数 ----------
function setStatus(state, text) {
	statusDot.className = "status-dot" + (state ? " " + state : "");
	if (text) statusText.textContent = text;
}
// 用户消息纯文本转义，防止XSS
function escapeHtml(text) {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}
/**
 * 新增：渲染单条消息
 * user：纯文本转义
 * assistant：markdown转html（依赖页面全局 mdToHtml）
 */
function addMessageToChat(role, content) {
	const wrapEl = document.createElement("div");
	wrapEl.className = `msg-wrap ${role}`;
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;

	if (role === "user") {
		// 用户输入原样转义，不解析markdown
		messageEl.innerHTML = `<p>${escapeHtml(content)}</p>`;
	} else {
		// AI回复解析Markdown：#标题、**加粗、```代码块无语言自动text
		messageEl.innerHTML = window.mdToHtml(content);
	}

	wrapEl.appendChild(messageEl);
	chatMessages.appendChild(wrapEl);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}
function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");
	const events = [];
	let eventEndIndex;
	while ((eventEndIndex = normalized.indexOf("\n\n")) !== -1) {
		const rawEvent = normalized.slice(0, eventEndIndex);
		normalized = normalized.slice(eventEndIndex + 2);
		const lines = rawEvent.split("\n");
		const dataLines = [];
		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(line.slice("data:".length).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		events.push(dataLines.join("\n"));
	}
	return { events, buffer: normalized };
}
// ---------- 发送消息 ----------
async function sendMessage() {
	const message = userInput.value.trim();
	if (message === "" || isProcessing) return;
	const conv = getCurrentConversation();
	if (!conv) return;
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;
	setStatus("thinking", "思考中...");
	addMessageToChat("user", message);
	userInput.value = "";
	userInput.style.height = "auto";
	typingIndicator.classList.add("visible");
	conv.messages.push({ role: "user", content: message });
	// 首条用户消息更新标题
	if (conv.title === "新对话") {
		updateConversationTitle(conv);
		chatTitle.textContent = conv.title;
		renderConversationList();
	}
	saveConversations();
	try {
		const wrapEl = document.createElement("div");
		wrapEl.className = "msg-wrap assistant";
		const assistantMessageEl = document.createElement("div");
		assistantMessageEl.className = "message assistant-message";
		wrapEl.appendChild(assistantMessageEl);
		chatMessages.appendChild(wrapEl);
		chatMessages.scrollTop = chatMessages.scrollHeight;

		const response = await fetch("/api/chat", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ messages: conv.messages }),
		});
		if (!response.ok) throw new Error("Failed to get response");
		if (!response.body) throw new Error("Response body is null");
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let responseText = "";
		let buffer = "";
		// 流式实时刷新Markdown渲染结果
		const flushAssistantText = () => {
			assistantMessageEl.innerHTML = window.mdToHtml(responseText);
			chatMessages.scrollTop = chatMessages.scrollHeight;
		};
		let sawDone = false;
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				const parsed = consumeSseEvents(buffer + "\n\n");
				for (const data of parsed.events) {
					if (data === "[DONE]") break;
					try {
						const jsonData = JSON.parse(data);
						let content = "";
						if (typeof jsonData.response === "string" && jsonData.response.length > 0) {
							content = jsonData.response;
						} else if (jsonData.choices?.[0]?.delta?.content) {
							content = jsonData.choices[0].delta.content;
						}
						if (content) { responseText += content; flushAssistantText(); }
					} catch (e) {
						console.error("Error parsing SSE data:", e, data);
					}
				}
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			const parsed = consumeSseEvents(buffer);
			buffer = parsed.buffer;
			for (const data of parsed.events) {
				if (data === "[DONE]") { sawDone = true; buffer = ""; break; }
				try {
					const jsonData = JSON.parse(data);
					let content = "";
					if (typeof jsonData.response === "string" && jsonData.response.length > 0) {
						content = jsonData.response;
					} else if (jsonData.choices?.[0]?.delta?.content) {
						content = jsonData.choices[0].delta.content;
					}
					if (content) { responseText += content; flushAssistantText(); }
				} catch (e) {
					console.error("Error parsing SSE data:", e, data);
				}
			}
			if (sawDone) break;
		}
		if (responseText.length > 0) {
			conv.messages.push({ role: "assistant", content: responseText });
			saveConversations();
			setStatus("", "就绪");
		} else {
			responseText = "（收到空响应）";
			assistantMessageEl.innerHTML = window.mdToHtml(responseText);
			setStatus("error", "空响应");
		}
	} catch (error) {
		console.error("Error:", error);
		const errContent = "抱歉，处理您的请求时出现了错误：" + error.message;
		addMessageToChat("assistant", errContent);
		conv.messages.push({ role: "assistant", content: errContent });
		saveConversations();
		setStatus("error", "错误");
	} finally {
		typingIndicator.classList.remove("visible");
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}
// ---------- 事件绑定 ----------
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});
sendButton.addEventListener("click", sendMessage);
newChatBtn.addEventListener("click", () => {
	if (isProcessing) return;
	createConversation();
});
clearButton.addEventListener("click", () => {
	if (isProcessing) return;
	const conv = getCurrentConversation();
	if (!conv) return;
	conv.messages = [{ role: "assistant", content: "对话已清空。请问有什么可以帮您？" }];
	conv.title = "新对话";
	chatTitle.textContent = "新对话";
	saveConversations();
	renderConversationList();
	renderMessages();
});
toggleSidebarBtn.addEventListener("click", () => {
	sidebar.classList.toggle("collapsed");
});
menuBtn.addEventListener("click", () => {
	sidebar.classList.toggle("collapsed");
});
// ---------- 文件上传 ----------
uploadFileBtn.addEventListener("click", () => {
	fileInput.click();
});
fileInput.addEventListener("change", (e) => {
	const file = e.target.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = (ev) => {
		const content = ev.target.result;
		const ext = file.name.split(".").pop().toLowerCase();
		const prefix = ` **${file.name}**\n\n\`\`\`${ext}\n${content}\n\`\`\``;
		userInput.value = prefix + "\n\n";
		userInput.focus();
		userInput.dispatchEvent(new Event("input"));
	};
	reader.readAsText(file);
	fileInput.value = "";
});
// ---------- 初始化 ----------
function hideDownloadWhenLocalWindows() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("app") === "local" && params.get("platform") === "windows") {
        downloadButton?.classList.add("hidden");
        downloadButton?.setAttribute("aria-hidden", "true");
    }
}

conversations = loadConversations();
const savedId = localStorage.getItem(CURRENT_KEY);
if (savedId && conversations.find((c) => c.id === savedId)) {
	currentId = savedId;
} else if (conversations.length > 0) {
	currentId = conversations[0].id;
}
if (conversations.length === 0) {
	createConversation();
} else {
	renderConversationList();
	renderMessages();
}

hideDownloadWhenLocalWindows();
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';
import { executeTool, tools } from './skills';

export class Agent {
    private view: vscode.WebviewView;
    private messages: any[] = [];
    private pendingActionResolvers: Map<string, (allowed: boolean) => void> = new Map();
    private actionCounter = 0;
    private stopped = false;

    constructor(view: vscode.WebviewView) {
        this.view = view;
        this.initializeSystemPrompt();
    }

    public setView(view: vscode.WebviewView) {
        this.view = view;
    }

    public stop() {
        this.stopped = true;
        for (const [, resolver] of this.pendingActionResolvers) {
            resolver(false);
        }
        this.pendingActionResolvers.clear();
        this.view.webview.postMessage({ type: 'stopThinking' });
        this.view.webview.postMessage({ type: 'setIdle' });
    }

    public restoreChatHistory() {
        for (const msg of this.messages) {
            if (msg.role === 'user' && typeof msg.content === 'string' && !msg.content.startsWith('System Error') && !msg.content.startsWith('You described')) {
                this.view.webview.postMessage({ type: 'appendUserMessage', value: msg.content });
            } else if (msg.role === 'assistant' && msg.content) {
                this.view.webview.postMessage({ type: 'appendAgentMessage', value: msg.content });
            } else if (msg.role === 'tool' && msg.content) {
                this.view.webview.postMessage({
                    type: 'appendAgentMessage',
                    value: `✅ [${msg.name}]\n${String(msg.content).substring(0, 300)}`
                });
            }
        }
    }

    private initializeSystemPrompt() {
        let systemPrompt = `You are Local Agent, a fully autonomous AI software engineer running INSIDE the user's VS Code editor.

ABSOLUTE RULES - NEVER BREAK THESE:
1. NEVER write or show code in the chat. ZERO code blocks in messages. The user cannot see code in chat.
2. When the user asks you to create ANY file, script, game, app, or code - you MUST immediately call the editFile tool. Do NOT say "I'll create..." and then not call a tool. CALL THE TOOL FIRST.
3. When you need to run commands, install packages, or execute anything - call runTerminalCommand immediately.
4. Chain multiple tool calls: first editFile to create files, then runTerminalCommand to install/run.
5. You may write SHORT plain-text status messages like "Creating pong.html..." but ALWAYS follow with a tool call in the SAME response.
6. NEVER ask the user if they want you to proceed. Just do it.
7. CONTINUITY: This is an ongoing conversation. The full history is always included. If you stopped mid-task and the user says "devam et" or "continue", pick up exactly where you left off and complete the remaining steps using tools.
8. When you finish ALL tasks, write a brief summary of what was done (file paths created, commands run). Do NOT ask follow-up questions.

Tool workflow for "create a game/app/script":
- Step 1: Call editFile with the full file content
- Step 2: Call runTerminalCommand if dependencies need installing
- Step 3: Confirm success with file paths in a short message`;

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const root = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // Load .agentrules
            const rulesPath = path.join(root, '.agentrules');
            if (fs.existsSync(rulesPath)) {
                try {
                    const rules = fs.readFileSync(rulesPath, 'utf8');
                    systemPrompt += `\n\nProject Rules:\n${rules}`;
                } catch { /* ignore */ }
            }

            // Load custom user-defined skills from .agent/skills/
            const skillsDir = path.join(root, '.agent', 'skills');
            if (fs.existsSync(skillsDir)) {
                const skillFiles = fs.readdirSync(skillsDir).filter(f =>
                    f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.skill')
                );

                if (skillFiles.length > 0) {
                    systemPrompt += `\n\n== CUSTOM SKILLS ==\nThe user has defined the following custom skills. When the user invokes one by name, you MUST follow those instructions exactly using your tools. Do NOT ask for clarification — just execute.\n`;
                    for (const skillFile of skillFiles) {
                        const skillName = path.basename(skillFile, path.extname(skillFile));
                        try {
                            const skillContent = fs.readFileSync(path.join(skillsDir, skillFile), 'utf8');
                            systemPrompt += `\n--- SKILL: ${skillName} ---\n${skillContent.trim()}\n`;
                        } catch { /* ignore */ }
                    }
                    systemPrompt += `\n== END CUSTOM SKILLS ==`;
                }
            }
        }

        this.messages.push({ role: 'system', content: systemPrompt });
    }

    public handleHumanResponse(action: string, id: string) {
        const resolver = this.pendingActionResolvers.get(id);
        if (resolver) {
            resolver(action === 'accept');
            this.pendingActionResolvers.delete(id);
        }
    }

    // ─── HTTP helpers ──────────────────────────────────────────────────────────

    private httpPost(urlStr: string, body: string): Promise<{ statusCode: number; data: string }> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const isHttps = url.protocol === 'https:';
            const mod = isHttps ? https : http;
            const bodyBuf = Buffer.from(body, 'utf-8');
            const req = mod.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': bodyBuf.length }
            }, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve({ statusCode: res.statusCode || 0, data: Buffer.concat(chunks).toString('utf-8') }));
            });
            req.on('error', reject);
            req.write(bodyBuf);
            req.end();
        });
    }

    private httpPostStream(urlStr: string, body: string, onLine: (line: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const isHttps = url.protocol === 'https:';
            const mod = isHttps ? https : http;
            const bodyBuf = Buffer.from(body, 'utf-8');
            const req = mod.request({
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': bodyBuf.length }
            }, (res) => {
                let buf = '';
                res.on('data', (chunk: Buffer) => {
                    buf += chunk.toString('utf-8');
                    const lines = buf.split('\n');
                    buf = lines.pop() || '';
                    for (const line of lines) { onLine(line); }
                });
                res.on('end', () => { if (buf.trim()) onLine(buf); resolve(); });
            });
            req.on('error', reject);
            req.write(bodyBuf);
            req.end();
        });
    }

    // ─── LLM call ─────────────────────────────────────────────────────────────

    private async callLLM(): Promise<any> {
        const config = vscode.workspace.getConfiguration('localAgent');
        const baseUrl = config.get<string>('apiBaseUrl') || 'http://127.0.0.1:11434/v1';
        const modelName = config.get<string>('modelName') || 'llama3';
        const streamMode = config.get<boolean>('streamResponse') ?? false;

        let endpoint = baseUrl.endsWith('/') ? `${baseUrl}chat/completions` : `${baseUrl}/chat/completions`;
        endpoint = endpoint.replace('localhost', '127.0.0.1');

        this.view.webview.postMessage({ type: 'startThinking' });

        try {
            const payload = JSON.stringify({ model: modelName, messages: this.messages, tools, tool_choice: 'auto', stream: streamMode });

            if (streamMode) {
                let fullContent = '';
                let toolCalls: any[] = [];
                let streamStarted = false;

                await this.httpPostStream(endpoint, payload, (line) => {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') { return; }
                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        const delta = parsed.choices?.[0]?.delta;
                        if (!delta) { return; }
                        if (delta.content) {
                            if (!streamStarted) { streamStarted = true; this.view.webview.postMessage({ type: 'startStreamMessage' }); }
                            fullContent += delta.content;
                            this.view.webview.postMessage({ type: 'streamChunk', value: delta.content });
                        }
                        if (delta.tool_calls) {
                            for (const tc of delta.tool_calls) {
                                const idx: number = tc.index ?? 0;
                                if (!toolCalls[idx]) { toolCalls[idx] = { id: tc.id || `call_${idx}`, type: 'function', function: { name: '', arguments: '' } }; }
                                if (tc.function?.name) { toolCalls[idx].function.name += tc.function.name; }
                                if (tc.function?.arguments) { toolCalls[idx].function.arguments += tc.function.arguments; }
                            }
                        }
                    } catch { /* skip */ }
                });

                this.view.webview.postMessage({ type: 'endStreamMessage' });
                this.view.webview.postMessage({ type: 'stopThinking' });
                return { role: 'assistant', content: fullContent || null, tool_calls: toolCalls.filter(Boolean).length > 0 ? toolCalls.filter(Boolean) : undefined };

            } else {
                const result = await this.httpPost(endpoint, payload);
                this.view.webview.postMessage({ type: 'stopThinking' });
                if (result.statusCode < 200 || result.statusCode >= 300) { throw new Error(`HTTP ${result.statusCode}: ${result.data}`); }
                const data = JSON.parse(result.data);
                return data.choices[0].message;
            }
        } catch (err: any) {
            this.view.webview.postMessage({ type: 'stopThinking' });
            throw new Error(`LLM error: ${err.message}`);
        }
    }

    // ─── Public entry ──────────────────────────────────────────────────────────

    /** Re-read .agentrules and .agent/skills/ so changes take effect without restart */
    private refreshSystemContext() {
        if (!vscode.workspace.workspaceFolders?.length) { return; }
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;

        // Find existing system message
        const sysMsg = this.messages.find(m => m.role === 'system');
        if (!sysMsg) { return; }

        // Strip previous dynamic sections (rules + skills) and rebuild
        let base = sysMsg.content as string;
        // Remove everything from "\n\nProject Rules:" or "\n\n== CUSTOM SKILLS ==" onward
        base = base.replace(/\n\nProject Rules:[\s\S]*$/, '');
        base = base.replace(/\n\n== CUSTOM SKILLS ==[\s\S]*$/, '');

        // Re-read .agentrules
        const rulesPath = path.join(root, '.agentrules');
        if (fs.existsSync(rulesPath)) {
            try {
                const rules = fs.readFileSync(rulesPath, 'utf8').trim();
                if (rules) { base += `\n\nProject Rules (from .agentrules — follow these strictly):\n${rules}`; }
            } catch { /* ignore */ }
        }

        // Re-read .agent/skills/
        const skillsDir = path.join(root, '.agent', 'skills');
        if (fs.existsSync(skillsDir)) {
            const skillFiles = fs.readdirSync(skillsDir).filter(f =>
                f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.skill')
            );
            if (skillFiles.length > 0) {
                base += `\n\n== CUSTOM SKILLS ==\nWhen the user invokes a skill by name, follow its instructions exactly using your tools.\n`;
                for (const sf of skillFiles) {
                    const skillName = path.basename(sf, path.extname(sf));
                    try {
                        const content = fs.readFileSync(path.join(skillsDir, sf), 'utf8');
                        base += `\n--- SKILL: ${skillName} ---\n${content.trim()}\n`;
                    } catch { /* ignore */ }
                }
                base += `\n== END CUSTOM SKILLS ==`;
            }
        }

        sysMsg.content = base;
    }

    public async processUserMessage(message: string) {
        this.stopped = false;
        this.refreshSystemContext();   // ← re-read rules & skills every time
        this.messages.push({ role: 'user', content: message });
        this.view.webview.postMessage({ type: 'setBusy' });
        try {
            await this.runAgentLoop();
        } finally {
            this.view.webview.postMessage({ type: 'setIdle' });
        }
    }

    // ─── Agent loop ───────────────────────────────────────────────────────────

    private async runAgentLoop() {
        let isComplete = false;
        let iteration = 0;
        let nudgeCount = 0;

        while (!isComplete && !this.stopped && iteration < 30) {
            iteration++;
            try {
                const llmMessage = await this.callLLM();
                if (this.stopped) { break; }

                this.messages.push(llmMessage);

                if (llmMessage.content) {
                    const config = vscode.workspace.getConfiguration('localAgent');
                    const streamMode = config.get<boolean>('streamResponse') ?? false;
                    if (!streamMode) {
                        this.view.webview.postMessage({ type: 'appendAgentMessage', value: llmMessage.content });
                    }
                }

                if (llmMessage.tool_calls && llmMessage.tool_calls.length > 0) {
                    nudgeCount = 0; // reset nudge counter on successful tool use
                    for (const toolCall of llmMessage.tool_calls) {
                        if (this.stopped) { break; }
                        const toolName: string = toolCall.function.name;
                        let args: any = {};
                        try { args = JSON.parse(toolCall.function.arguments); } catch { /* keep empty */ }

                        const allowed = await this.checkAutonomyOrPrompt(toolName, args);
                        if (this.stopped) { break; }

                        let toolResult = '';
                        if (allowed) {
                            const overlayMessages: Record<string, [string, string]> = {
                                editFile: ['⟨ WRITING ⟩', 'creating file on disk...'],
                                runTerminalCommand: ['⟨ EXECUTING ⟩', 'running terminal command...'],
                                readFile: ['⟨ READING ⟩', 'reading file contents...'],
                                searchFiles: ['⟨ SEARCHING ⟩', 'searching your workspace...'],
                            };
                            const [main, sub] = overlayMessages[toolName] || ['⟨ WORKING ⟩', `running ${toolName}...`];
                            // Build a detail string: "editFile: path/to/file.ts"
                            const detailMap: Record<string, string> = {
                                editFile: args.filePath || '',
                                runTerminalCommand: args.command || '',
                                readFile: args.filePath || '',
                                searchWeb: args.query || '',
                                fetchUrl: args.url || '',
                            };
                            const detail = `${toolName}:${detailMap[toolName] ?? ''}`;
                            this.view.webview.postMessage({ type: 'showOverlay', main, sub, detail });

                            const root = vscode.workspace.workspaceFolders
                                ? vscode.workspace.workspaceFolders[0].uri.fsPath
                                : process.cwd();
                            toolResult = await executeTool(toolName, args, { cwd: root });
                        } else {
                            toolResult = 'User rejected the action.';
                        }

                        this.messages.push({ role: 'tool', tool_call_id: toolCall.id, name: toolName, content: toolResult });
                        this.view.webview.postMessage({
                            type: 'appendAgentMessage',
                            value: `✅ [${toolName}]\n${toolResult.substring(0, 400)}${toolResult.length > 400 ? '...' : ''}`
                        });
                    }
                } else {
                    // No tool calls — check if model described intent without acting (max 3 nudges)
                    const intentPattern = /oluşturuyorum|yazıyorum|yapıyorum|creating|writing|building|installing|now I|I will|I'll|let me|şimdi|hazırlıyorum|ekleyeceğim|yüklüyorum|oluşturacağım/i;
                    const hasUnfulfilledIntent = llmMessage.content && intentPattern.test(llmMessage.content);

                    if (hasUnfulfilledIntent && nudgeCount < 1) {
                        nudgeCount++;
                        this.messages.push({
                            role: 'user',
                            content: `You described intent but called no tools. You MUST call editFile or runTerminalCommand RIGHT NOW. Do not describe, just act.`
                        });
                        this.view.webview.postMessage({ type: 'showOverlay', main: '⟨ NUDGING ⟩', sub: 'pushing agent to act...', detail: 'LLM: nudging to call tools' });
                    } else {
                        isComplete = true;
                    }
                }
            } catch (err: any) {
                this.view.webview.postMessage({ type: 'appendAgentMessage', value: `❌ ${err.message}\n\n> "devam et" yazarsanız kaldığım yerden devam ederim.` });
                break;
            }
        }

        if (this.stopped) {
            this.view.webview.postMessage({ type: 'appendAgentMessage', value: '⏹ Durduruldu. "devam et" yazarsanız kaldığım yerden devam ederim.' });
        }
    }

    // ─── Autonomy gate ────────────────────────────────────────────────────────

    private async checkAutonomyOrPrompt(toolName: string, args: any): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('localAgent');
        const autoMode = config.get<boolean>('autonomyMode');
        if (autoMode) { return true; }
        if (['readFile', 'searchWeb', 'fetchUrl'].includes(toolName)) { return true; }

        const actionId = `action_${this.actionCounter++}`;
        this.view.webview.postMessage({ type: 'promptAction', id: actionId, toolName, args });

        return new Promise<boolean>((resolve) => {
            this.pendingActionResolvers.set(actionId, resolve);
        });
    }
}

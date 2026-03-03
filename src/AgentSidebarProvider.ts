import * as vscode from 'vscode';
import { Agent } from './agent/Agent';
import { getNonce } from './utils';

export class AgentSidebarProvider implements vscode.WebviewViewProvider {
    _view?: vscode.WebviewView;
    _doc?: vscode.TextDocument;
    private agent?: Agent;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        if (this.agent) {
            this.agent.setView(this._view);
            // Re-stream all prior chat context to the new view
            this.agent.restoreChatHistory();
        }

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'onInfo': {
                    if (!data.value) return;
                    vscode.window.showInformationMessage(data.value);
                    break;
                }
                case 'onError': {
                    if (!data.value) return;
                    vscode.window.showErrorMessage(data.value);
                    break;
                }
                case 'resetAgent': {
                    this.agent = new Agent(this._view!);
                    break;
                }
                case 'submitMessage': {
                    if (!this.agent) {
                        this.agent = new Agent(this._view!);
                    }
                    this._view?.webview.postMessage({ type: 'appendUserMessage', value: data.value });
                    await this.agent.processUserMessage(data.value);
                    break;
                }
                case 'stopAgent': {
                    if (this.agent) {
                        this.agent.stop();
                    }
                    break;
                }
                case 'humanResponse': {
                    if (this.agent) {
                        this.agent.handleHumanResponse(data.action, data.id);
                    }
                    break;
                }
            }
        });
    }

    public revive(panel: vscode.WebviewView) {
        this._view = panel;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();
        // The HTML with Matrix style theme
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Local Agent</title>
                <style>
                    :root {
                        --matrix-green: #00FF41;
                        --matrix-dark-green: #008F11;
                        --matrix-bg: #0D0208;
                        --text-color: var(--matrix-green);
                        --bg-color: var(--vscode-editor-background, var(--matrix-bg));
                    }
                    html, body {
                        height: 100%;
                        margin: 0;
                        padding: 0;
                        overflow: hidden;
                    }
                    body {
                        background-color: var(--bg-color);
                        color: var(--text-color);
                        font-family: 'Courier New', Courier, monospace;
                        position: relative;
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        box-sizing: border-box;
                        padding: 10px;
                    }
                    .chat-container {
                        flex: 1;
                        overflow-y: auto;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                        margin-bottom: 10px;
                    }
                    .message {
                        padding: 8px;
                        border-radius: 4px;
                        border: 1px solid var(--matrix-dark-green);
                        word-wrap: break-word;
                    }
                    .user-msg {
                        background-color: rgba(0, 143, 17, 0.1);
                        border-color: #008F11;
                        align-self: flex-end;
                        max-width: 85%;
                    }
                    .agent-msg {
                        background-color: rgba(0, 255, 65, 0.05);
                        border-color: #00FF41;
                        align-self: flex-start;
                        max-width: 95%;
                    }
                    .input-container {
                        display: flex;
                        gap: 5px;
                    }
                    input[type="text"] {
                        flex: 1;
                        background: rgba(0, 0, 0, 0.8);
                        color: var(--matrix-green);
                        border: 1px solid var(--matrix-dark-green);
                        padding: 8px;
                        font-family: inherit;
                        outline: none;
                    }
                    input[type="text"]:focus {
                        border-color: var(--matrix-green);
                        box-shadow: 0 0 5px var(--matrix-green);
                    }
                    button {
                        background: var(--matrix-dark-green);
                        color: #0D0208;
                        border: 1px solid var(--matrix-green);
                        padding: 8px 15px;
                        cursor: pointer;
                        font-weight: bold;
                        font-family: inherit;
                        transition: all 0.2s;
                    }
                    button:hover {
                        background: var(--matrix-green);
                        box-shadow: 0 0 8px var(--matrix-green);
                    }

                    /* Matrix Overlay — position:absolute relative to body */
                    #matrixOverlay {
                        display: none;
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        z-index: 9999;
                        background: rgba(0,0,0,0.92);
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                    }
                    #matrixOverlay.active { display: flex !important; }
                    #matrixCanvas {
                        position: absolute;
                        top: 0; left: 0;
                        width: 100%; height: 100%;
                        opacity: 0.55;
                    }
                    #matrixStatus {
                        position: relative;
                        z-index: 10;
                        text-align: center;
                        color: #00FF41;
                        font-family: 'Courier New', monospace;
                        text-shadow: 0 0 14px #00FF41, 0 0 24px #00FF41;
                        user-select: none;
                    }
                    #matrixStatus .status-main {
                        font-size: 18px;
                        font-weight: bold;
                        letter-spacing: 3px;
                        animation: matrixPulse 2s ease-in-out infinite;
                    }
                    #matrixStatus .status-sub {
                        font-size: 11px;
                        margin-top: 10px;
                        opacity: 0.7;
                        letter-spacing: 2px;
                        animation: matrixPulse 2s ease-in-out infinite reverse;
                    }
                    @keyframes matrixPulse {
                        0%,100% { opacity: 0.6; text-shadow: 0 0 8px #00FF41; }
                        50% { opacity: 1; text-shadow: 0 0 20px #00FF41, 0 0 40px #00FF41; }
                    }
                    #matrixTimer {
                        position: relative;
                        z-index: 10;
                        margin-top: 14px;
                        font-size: 12px;
                        font-family: 'Courier New', monospace;
                        color: #008F11;
                        letter-spacing: 2px;
                    }

                    .action-prompt {
                        margin-top: 10px;
                        padding: 10px;
                        border: 1px solid var(--matrix-green);
                        background: rgba(0,0,0,0.5);
                    }
                    .action-btn-group {
                        display: flex;
                        gap: 10px;
                        margin-top: 10px;
                    }
                    .btn-accept { background: #00FF41; color: #000; }
                    .btn-reject { background: #FF0000; color: #FFF; border-color: #FF0000; }
                    .markdown { white-space: pre-wrap; font-size: 13px; }
                    @keyframes blink {
                        0% { opacity: 0.3; } 100% { opacity: 1; }
                    }
                    /* overlay top/bottom split */
                    #matrixTop {
                        position: relative;
                        z-index: 10;
                        flex: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    #matrixLog {
                        position: relative;
                        z-index: 10;
                        width: 100%;
                        height: 45%;
                        background: #050f05;
                        border-top: 2px solid #00FF41;
                        overflow-y: auto;
                        padding: 8px 10px;
                        box-sizing: border-box;
                        font-size: 11px;
                        font-family: 'Courier New', monospace;
                        color: #00FF41;
                    }
                    #matrixLogInner { display: flex; flex-direction: column; gap: 4px; }
                    .log-entry { word-break: break-all; line-height: 1.4; }
                    .log-entry .log-time { color: #005500; margin-right: 6px; }
                    .log-entry .log-action { color: #00FF41; font-weight: bold; margin-right: 6px; }
                    .log-entry .log-detail { color: #88FF88; }
                </style>
            </head>
            <body>
                <!-- Matrix Rain Overlay -->
                <div id="matrixOverlay">
                    <canvas id="matrixCanvas"></canvas>
                    <div id="matrixTop">
                        <div id="matrixStatus">
                            <div class="status-main" id="statusMain">⟨ THINKING ⟩</div>
                            <div class="status-sub" id="statusSub">let the magic happen...</div>
                        </div>
                        <div id="matrixTimer">⏱ 0s</div>
                    </div>
                    <div id="matrixLog">
                        <div id="matrixLogInner"></div>
                    </div>
                </div>
                <div class="chat-container" id="chatContainer">
                    <div class="message agent-msg">
                        <div class="markdown">Wake up, Neo... Local Agent is ready.</div>
                    </div>
                </div>
                <div class="input-container">
                    <input type="text" id="promptInput" placeholder="Enter your prompt...">
                    <button id="sendBtn">Send</button>
                    <button id="stopBtn" title="Stop Agent" style="display:none;background:#FF0000;color:#fff;border-color:#FF0000">■ Stop</button>
                    <button id="resetBtn" title="Reset Agent Context">↺</button>
                </div>
                <script nonce="${nonce}">
                    const vscode = acquireVsCodeApi();
                    
                    const chatContainer = document.getElementById('chatContainer');
                    const promptInput = document.getElementById('promptInput');
                    const sendBtn = document.getElementById('sendBtn');
                    const stopBtn = document.getElementById('stopBtn');
                    const resetBtn = document.getElementById('resetBtn');
                    const matrixOverlay = document.getElementById('matrixOverlay');
                    const matrixLogInner = document.getElementById('matrixLogInner');
                    const matrixCanvas = document.getElementById('matrixCanvas');
                    const matrixTimer = document.getElementById('matrixTimer');
                    const statusMain = document.getElementById('statusMain');
                    const statusSub = document.getElementById('statusSub');
                    const ctx = matrixCanvas.getContext('2d');

                    // Global variables
                    let currentThinkingElement = null;
                    let currentStreamElement = null;
                    let isBusy = false;
                    let matrixAnimId = null;
                    let statusRotateId = null;
                    let timerInterval = null;
                    let timerSeconds = 0;
                    let messageQueue = [];

                    // ── Matrix canvas rain ──────────────────────────────
                    const CHARS = 'アァイィウヴエェオォカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF<>{}[]|';
                    let drops = [];

                    function resizeCanvas() {
                        matrixCanvas.width = matrixOverlay.offsetWidth;
                        matrixCanvas.height = matrixOverlay.offsetHeight;
                        const cols = Math.floor(matrixCanvas.width / 14);
                        drops = Array(cols).fill(1);
                    }

                    function drawMatrix() {
                        ctx.fillStyle = 'rgba(0,0,0,0.05)';
                        ctx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
                        ctx.font = '13px monospace';
                        drops.forEach((y, i) => {
                            const bright = Math.random() > 0.95;
                            ctx.fillStyle = bright ? '#ffffff' : '#00FF41';
                            const char = CHARS[Math.floor(Math.random() * CHARS.length)];
                            ctx.fillText(char, i * 14, y * 14);
                            if (y * 14 > matrixCanvas.height && Math.random() > 0.975) { drops[i] = 0; }
                            drops[i]++;
                        });
                        matrixAnimId = requestAnimationFrame(drawMatrix);
                    }

                    const STATUS_MESSAGES = [
                        ['⟨ THINKING ⟩', 'let the magic happen...'],
                        ['⟨ WORKING ⟩', 'code is being generated...'],
                        ['⟨ PROCESSING ⟩', 'the matrix is compiling...'],
                        ['⟨ BUILDING ⟩', 'writing files to disk...'],
                        ['⟨ RUNNING ⟩', 'executing commands...'],
                        ['⟨ COMPUTING ⟩', 'follow the white rabbit...'],
                    ];
                    let statusIdx = 0;

                    function rotateStatus() {
                        statusIdx = (statusIdx + 1) % STATUS_MESSAGES.length;
                        statusMain.textContent = STATUS_MESSAGES[statusIdx][0];
                        statusSub.textContent = STATUS_MESSAGES[statusIdx][1];
                        statusRotateId = setTimeout(rotateStatus, 2800);
                    }

                    function showOverlay(mainText, subText, detail) {
                        // Activate FIRST so offsetWidth/Height are real
                        statusMain.textContent = mainText || STATUS_MESSAGES[0][0];
                        statusSub.textContent = subText || STATUS_MESSAGES[0][1];
                        matrixOverlay.classList.add('active');
                        // Now resize canvas with real dimensions
                        resizeCanvas();
                        if (!matrixAnimId) { drawMatrix(); }
                        if (!statusRotateId && !mainText) { statusRotateId = setTimeout(rotateStatus, 2800); }
                        // Start elapsed timer (only if not already running)
                        if (!timerInterval) {
                            timerSeconds = 0;
                            matrixTimer.textContent = '⏱ 0s';
                            timerInterval = setInterval(() => {
                                timerSeconds++;
                                const m = Math.floor(timerSeconds / 60);
                                const s = timerSeconds % 60;
                                matrixTimer.textContent = m > 0
                                    ? '⏱ ' + m + 'm ' + s + 's'
                                    : '⏱ ' + timerSeconds + 's';
                            }, 1000);
                        }
                        // Append to command log
                        if (detail) {
                            const now = new Date();
                            const ts = now.toTimeString().slice(0,8);
                            const entry = document.createElement('div');
                            entry.className = 'log-entry';
                            const parts = detail.split(':', 2);
                            entry.innerHTML =
                                '<span class="log-time">' + ts + '</span>' +
                                '<span class="log-action">[' + (parts[0]||'') + ']</span>' +
                                '<span class="log-detail">' + escapeHtml(parts[1] || detail) + '</span>';
                            matrixLogInner.appendChild(entry);
                            matrixLogInner.scrollTop = matrixLogInner.scrollHeight;
                            // Keep max 40 entries
                            while (matrixLogInner.children.length > 40) {
                                matrixLogInner.removeChild(matrixLogInner.firstChild);
                            }
                        }
                    }

                    function hideOverlay() {
                        matrixOverlay.classList.remove('active');
                        if (matrixAnimId) { cancelAnimationFrame(matrixAnimId); matrixAnimId = null; }
                        if (statusRotateId) { clearTimeout(statusRotateId); statusRotateId = null; }
                        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
                        statusIdx = 0;
                    }
                    // ───────────────────────────────────────────────────

                    promptInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !isBusy) { sendMsg(); }
                    });
                    sendBtn.addEventListener('click', () => { if (!isBusy) sendMsg(); });
                    stopBtn.addEventListener('click', () => {
                        vscode.postMessage({ type: 'stopAgent' });
                        hideOverlay();
                    });
                    resetBtn.addEventListener('click', () => {
                        chatContainer.innerHTML = '<div class="message agent-msg"><div class="markdown">Agent memory wiped. Ready.</div></div>';
                        vscode.postMessage({ type: 'resetAgent' });
                        setBusy(false);
                        hideOverlay();
                    });

                    function setBusy(busy) {
                        isBusy = busy;
                        sendBtn.style.display = busy ? 'none' : '';
                        stopBtn.style.display = busy ? '' : 'none';
                        promptInput.disabled = busy;
                    }

                    function sendMsg() {
                        const val = promptInput.value.trim();
                        if (!val) return;
                        promptInput.value = '';

                        if (isBusy) {
                            // Queue the message — show it grayed out
                            messageQueue.push(val);
                            const qDiv = document.createElement('div');
                            qDiv.className = 'message user-msg';
                            qDiv.style.opacity = '0.45';
                            qDiv.title = 'Sırada bekliyor...';
                            qDiv.innerHTML = '<div class="markdown">⏳ ' + escapeHtml(val) + '</div>';
                            chatContainer.appendChild(qDiv);
                            scrollToBottom();
                            return;
                        }

                        // Immediately lock the UI
                        setBusy(true);
                        vscode.postMessage({ type: 'submitMessage', value: val });
                    }

                    function scrollToBottom() {
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }

                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'appendUserMessage': {
                                const msgDiv = document.createElement('div');
                                msgDiv.className = 'message user-msg';
                                msgDiv.innerHTML = '<div class="markdown">' + escapeHtml(message.value) + '</div>';
                                chatContainer.appendChild(msgDiv);
                                scrollToBottom();
                                break;
                            }
                            case 'appendAgentMessage': {
                                removeThinking();
                                const msgDiv = document.createElement('div');
                                msgDiv.className = 'message agent-msg';
                                msgDiv.innerHTML = '<div class="markdown">' + escapeHtml(message.value) + '</div>';
                                chatContainer.appendChild(msgDiv);
                                scrollToBottom();
                                break;
                            }
                            case 'startThinking': {
                                setBusy(true);
                                showOverlay('⟨ THINKING ⟩', 'let the magic happen...', 'LLM: processing request...');
                                break;
                            }
                            case 'showOverlay': {
                                showOverlay(message.main, message.sub, message.detail);
                                break;
                            }
                            case 'startStreamMessage': {
                                hideOverlay();
                                currentStreamElement = document.createElement('div');
                                currentStreamElement.className = 'message agent-msg';
                                currentStreamElement.innerHTML = '<div class="markdown"></div>';
                                chatContainer.appendChild(currentStreamElement);
                                scrollToBottom();
                                break;
                            }
                            case 'streamChunk': {
                                if (currentStreamElement) {
                                    const mkdn = currentStreamElement.querySelector('.markdown');
                                    if (mkdn) {
                                        mkdn.innerHTML += escapeHtml(message.value);
                                        scrollToBottom();
                                    }
                                }
                                break;
                            }
                            case 'endStreamMessage': {
                                currentStreamElement = null;
                                break;
                            }
                            case 'stopThinking': {
                                hideOverlay();
                                break;
                            }
                            case 'setBusy': {
                                setBusy(true);
                                break;
                            }
                            case 'setIdle': {
                                setBusy(false);
                                hideOverlay();
                                // Drain the message queue
                                if (messageQueue.length > 0) {
                                    const next = messageQueue.shift();
                                    setBusy(true);
                                    vscode.postMessage({ type: 'submitMessage', value: next });
                                }
                                break;
                            }
                            case 'appendAgentMessage': {
                                hideOverlay();
                                const msgDiv2 = document.createElement('div');
                                msgDiv2.className = 'message agent-msg';
                                msgDiv2.innerHTML = '<div class="markdown">' + escapeHtml(message.value) + '</div>';
                                chatContainer.appendChild(msgDiv2);
                                scrollToBottom();
                                break;
                            }
                            case 'promptAction': {
                                hideOverlay();
                                // Create Accept/Reject Box
                                const id = message.id;
                                const msgDiv = document.createElement('div');
                                msgDiv.className = 'message agent-msg';
                                msgDiv.innerHTML = 
                                    '<div class="action-prompt">' +
                                        '<div><strong>Action Requested:</strong> ' + escapeHtml(message.toolName) + '</div>' +
                                        '<pre>' + escapeHtml(JSON.stringify(message.args, null, 2)) + '</pre>' +
                                        '<div class="action-btn-group" id="group-' + id + '">' +
                                            '<button class="btn-accept" onclick="respondAction(\\'' + id + '\\', \\'accept\\')">Accept</button>' +
                                            '<button class="btn-reject" onclick="respondAction(\\'' + id + '\\', \\'reject\\')">Reject</button>' +
                                        '</div>' +
                                    '</div>';
                                chatContainer.appendChild(msgDiv);
                                scrollToBottom();
                                break;
                            }
                        }
                    });

                    function removeThinking() {
                        if (currentThinkingElement) {
                            currentThinkingElement.remove();
                            currentThinkingElement = null;
                        }
                    }

                    window.respondAction = (id, action) => {
                        vscode.postMessage({ type: 'humanResponse', id, action });
                        const group = document.getElementById('group-' + id);
                        if (group) group.innerHTML = action === 'accept' ? '<span style="color:#00FF41">Accepted</span>' : '<span style="color:#FF0000">Rejected</span>';
                    };

                    function escapeHtml(unsafe) {
                        return (unsafe || '').toString()
                             .replace(/&/g, "&amp;")
                             .replace(/</g, "&lt;")
                             .replace(/>/g, "&gt;");
                    }
                </script>
            </body>
            </html>`;
    }
}

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const http = require('node:http');
const { once } = require('node:events');

let settings = {};
let requestedScope;
const originalLoad = Module._load;
Module._load = function (name, ...rest) {
    if (name === 'vscode') return {
        Uri: { file: fsPath => ({ fsPath }) },
        workspace: {
            workspaceFolders: undefined,
            getConfiguration: (_section, scope) => {
                requestedScope = scope;
                return { get: (key, fallback) => settings[key] ?? fallback };
            }
        }
    };
    return originalLoad.call(this, name, ...rest);
};
const { executeTool } = require('../out/agent/skills');
const { Agent } = require('../out/agent/Agent');
Module._load = originalLoad;
const realFetch = global.fetch;
const realSetTimeout = global.setTimeout;
afterEach(() => { global.fetch = realFetch; global.setTimeout = realSetTimeout; settings = {}; });
const context = { cwd: '/tmp', sessionId: '12345678-1234-4123-8123-123456789012' };

function mockMcp({ error, sse = false, missing = false, empty = false, httpError, malformed = false, hang } = {}) {
    const requests = [];
    global.fetch = async (url, init) => {
        assert.equal(String(url), 'https://search.parallel.ai/mcp');
        const headers = new Headers(init.headers);
        assert.match(headers.get('User-Agent'), /^OpenZion\/0\.1\.0 /);
        assert.equal(headers.has('Authorization'), false);
        const message = init.body ? JSON.parse(init.body) : undefined;
        requests.push({ url: String(url), method: init.method, message, headers });
        if (init.method === 'GET') return new Response(null, { status: 405 });
        if (hang === message?.method) return new Promise((resolve, reject) => {
            if (init.signal.aborted) reject(init.signal.reason);
            else init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        });
        if (httpError && message?.method === 'tools/call') return new Response('Provider unavailable', { status: httpError });
        if (malformed && message?.method === 'tools/call') return new Response('invalid JSON', { headers: { 'Content-Type': 'application/json' } });
        if (message.id === undefined) return new Response(null, { status: 202 });
        let result;
        if (message.method === 'initialize') result = {
            protocolVersion: message.params.protocolVersion, capabilities: { tools: {} },
            serverInfo: { name: 'test-mcp', version: '1' }
        };
        else if (message.method === 'tools/list') result = {
            tools: missing ? [] : ['web_search', 'web_fetch'].map(name => ({ name, inputSchema: { type: 'object' } }))
        };
        else if (message.method === 'tools/call') result = {
            content: empty ? [] : [{ type: 'text', text: error || 'TypeScript docs: https://www.typescriptlang.org/docs/\nUseful programming documentation.' }],
            ...(error ? { isError: true } : {})
        };
        else throw new Error(`Unexpected MCP method: ${message.method}`);
        const body = JSON.stringify({ jsonrpc: '2.0', id: message.id, result });
        return new Response(sse ? `event: message\ndata: ${body}\n\n` : body, {
            headers: { 'Content-Type': sse ? 'text/event-stream' : 'application/json' }
        });
    };
    return requests;
}

test('fresh settings retain DuckDuckGo and direct page fetching', async () => {
    const urls = [];
    global.fetch = async url => {
        urls.push(String(url));
        return new Response(String(url).includes('duckduckgo')
            ? '<div class="result"><div class="result__title">Docs</div><a class="result__url" href="https://example.com/docs">Docs</a><div class="result__snippet">Useful docs</div></div>'
            : '<body>Page contents</body>');
    };
    assert.match(await executeTool('searchWeb', { query: 'a & b' }, context), /\[Title\]: Docs/);
    assert.match(await executeTool('fetchUrl', { url: 'https://example.com/docs' }, context), /Page contents/);
    assert.deepEqual(urls, ['https://html.duckduckgo.com/html/?q=a%20%26%20b', 'https://example.com/docs']);
    assert.equal(requestedScope.fsPath, '/tmp');
});

test('selected Parallel dispatches JSON and SSE search/fetch without credentials', async () => {
    settings = { webSearchProvider: 'parallel' };
    for (const sse of [false, true]) {
        const requests = mockMcp({ sse });
        assert.match(await executeTool('searchWeb', { query: 'TypeScript documentation' }, context), /https:\/\/www.typescriptlang.org/);
        assert.match(await executeTool('fetchUrl', { url: 'https://www.typescriptlang.org/docs/' }, context), /Useful programming/);
        const calls = requests.filter(r => r.message?.method === 'tools/call');
        assert.deepEqual(calls.map(r => r.message.params), [
            { name: 'web_search', arguments: { objective: 'TypeScript documentation', search_queries: ['TypeScript documentation'], session_id: context.sessionId } },
            { name: 'web_fetch', arguments: { urls: ['https://www.typescriptlang.org/docs/'], session_id: context.sessionId } }
        ]);
        assert.equal(requests.filter(r => r.message?.method === 'initialize').length, 2);
        assert.equal(requests.filter(r => r.message?.method === 'tools/list').length, 2);
    }
});

test('disabled, unknown providers and invalid inputs make no network requests', async () => {
    global.fetch = () => { throw new Error('Network must not run'); };
    for (const provider of ['disabled', 'unknown']) {
        settings.webSearchProvider = provider;
        for (const name of ['searchWeb', 'fetchUrl']) assert.match(await executeTool(name, {}, context), /disabled|Unknown/);
    }
    settings.webSearchProvider = 'parallel';
    assert.match(await executeTool('searchWeb', { query: ' ' }, context), /empty/);
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'bad', 'https://user:pass@example.com']) {
        assert.match(await executeTool('fetchUrl', { url }, context), /HTTP or HTTPS/);
    }
});

test('provider changes are read on the next tool dispatch', async () => {
    settings.webSearchProvider = 'parallel';
    const requests = mockMcp();
    assert.match(await executeTool('searchWeb', { query: 'docs' }, context), /TypeScript/);
    const count = requests.length;
    settings.webSearchProvider = 'disabled';
    assert.match(await executeTool('searchWeb', { query: 'docs' }, context), /disabled/);
    assert.equal(requests.length, count);
    settings.webSearchProvider = 'duckduckgo';
    global.fetch = async url => {
        assert.match(String(url), /^https:\/\/html.duckduckgo.com/);
        return new Response('<body>No results</body>');
    };
    assert.equal(await executeTool('searchWeb', { query: 'docs' }, context), 'No results found.');
});

test('provider errors and unavailable tools return readable failures without fallback', async () => {
    settings.webSearchProvider = 'parallel';
    for (const [options, expected] of [
        [{ error: 'Search quota reached' }, /Search quota reached/],
        [{ missing: true }, /does not advertise/],
        [{ empty: true }, /no readable content/],
        [{ httpError: 503 }, /Provider unavailable/],
        [{ httpError: 401 }, /Parallel request failed:/],
        [{ malformed: true }, /Parallel request failed:/]
    ]) {
        mockMcp(options);
        assert.match(await executeTool('searchWeb', { query: 'docs' }, context), expected);
    }
});

test('cancellation and the overall deadline abort handshake and active tool requests', async () => {
    settings.webSearchProvider = 'parallel';
    for (const hang of ['initialize', 'tools/call']) {
        mockMcp({ hang });
        const controller = new AbortController();
        const result = executeTool('searchWeb', { query: 'docs' }, { ...context, signal: controller.signal });
        realSetTimeout(() => controller.abort(), 15);
        assert.match(await result, /cancelled/);
        mockMcp({ hang });
        global.setTimeout = (callback, delay, ...args) => realSetTimeout(callback, delay === 30000 ? 15 : delay, ...args);
        assert.match(await executeTool('searchWeb', { query: 'docs' }, context), /timed out/);
        global.setTimeout = realSetTimeout;
    }
    const controller = new AbortController(); controller.abort();
    global.fetch = () => { throw new Error('Must not run'); };
    assert.match(await executeTool('searchWeb', { query: 'docs' }, { ...context, signal: controller.signal }), /cancelled/);
});

async function withScriptedModel(run) {
    const payloads = [];
    const server = http.createServer(async (request, response) => {
        let body = ''; for await (const chunk of request) body += chunk;
        payloads.push(JSON.parse(body));
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ choices: [{ message: payloads.length === 1 ? {
            role: 'assistant', content: null, tool_calls: ['searchWeb', 'fetchUrl'].map((name, index) => ({
                id: `call_${index}`, type: 'function', function: { name, arguments: JSON.stringify(name === 'searchWeb'
                    ? { query: 'TypeScript documentation' } : { url: 'https://www.typescriptlang.org/docs/' }) }
            }))
        } : { role: 'assistant', content: 'Documentation found.' } }] }));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    settings = { webSearchProvider: 'parallel', autonomyMode: false, apiBaseUrl: `http://127.0.0.1:${server.address().port}/v1` };
    const events = [];
    const agent = new Agent({ webview: { postMessage: event => events.push(event) } });
    try { await run(agent, payloads, events); }
    finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('scripted model drives the real agent loop and consumes search/fetch results', async () => {
    const requests = mockMcp();
    await withScriptedModel(async (agent, payloads, events) => {
        await agent.processUserMessage('Find the TypeScript documentation.');
        const toolResults = payloads[1].messages.filter(message => message.role === 'tool');
        assert.deepEqual(toolResults.map(message => message.name), ['searchWeb', 'fetchUrl']);
        for (const result of toolResults) assert.match(result.content, /Useful programming documentation/);
        assert.equal(events.some(event => event.type === 'promptAction'), false);
        const calls = requests.filter(r => r.message?.method === 'tools/call');
        assert.equal(calls[0].message.params.arguments.session_id, calls[1].message.params.arguments.session_id);
        assert.match(calls[0].message.params.arguments.session_id, /^[\da-f-]{36}$/);
        // Keep the existing write permission gate and cancellation of pending prompts.
        const permission = agent.checkAutonomyOrPrompt('editFile', { filePath: 'example.ts' });
        assert.equal(events.at(-1).type, 'promptAction');
        agent.stop(); assert.equal(await permission, false);
    });
});

test('Stop cancels an MCP operation launched by the real agent loop', async () => {
    const requests = mockMcp({ hang: 'tools/call' });
    await withScriptedModel(async (agent, payloads) => {
        const running = agent.processUserMessage('Find documentation.');
        while (!requests.some(r => r.message?.method === 'tools/call')) await new Promise(resolve => realSetTimeout(resolve, 5));
        agent.stop(); await running;
        assert.equal(payloads.length, 1);
        assert.equal(requests.filter(r => r.message?.method === 'tools/call').length, 1);
    });
});

test('live anonymous MCP through the real agent loop', { skip: process.env.OPENZION_LIVE_MCP !== '1' }, async () => {
    const observed = [];
    global.fetch = async (url, init) => {
        const headers = new Headers(init.headers);
        assert.equal(String(url), 'https://search.parallel.ai/mcp');
        assert.match(headers.get('User-Agent'), /^OpenZion\//);
        assert.equal(headers.has('Authorization'), false);
        observed.push(init.body ? JSON.parse(init.body).method : init.method);
        return realFetch(url, init);
    };
    await withScriptedModel(async (agent, payloads) => {
        await agent.processUserMessage('Find the TypeScript documentation.');
        const results = payloads[1].messages.filter(message => message.role === 'tool');
        for (const result of results) {
            console.log(JSON.stringify({ liveTool: result.name, content: result.content }));
            assert.doesNotMatch(result.content, /^(Parallel request failed:|Web request timed out|Web request cancelled|Error executing tool)/);
            assert.match(result.content, /typescript/i);
        }
        assert.equal(results.length, 2);
        assert.equal(observed.filter(method => method === 'tools/list').length, 2);
    });
});

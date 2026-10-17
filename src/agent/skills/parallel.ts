import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from './index';

const endpoint = 'https://search.parallel.ai/mcp';
const userAgent = 'OpenZion/0.1.0 (+https://github.com/aserhat81/OpenZion)';

/** One bounded, anonymous MCP operation, including discovery and cleanup. */
export async function callParallel(name: 'web_search' | 'web_fetch', args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const controller = new AbortController();
    const cancel = () => controller.abort(ctx.signal?.reason);
    ctx.signal?.addEventListener('abort', cancel, { once: true });
    if (ctx.signal?.aborted) { cancel(); }
    const timer = setTimeout(() => controller.abort(new Error('Web request timed out.')), 30000);
    const client = new Client({ name: 'OpenZion', version: '0.1.0' });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        requestInit: { headers: { 'User-Agent': userAgent } },
        // Apply the same deadline and Stop signal to handshake, discovery and calls.
        fetch: (url, init) => fetch(url, { ...init, signal: controller.signal })
    });
    try {
        controller.signal.throwIfAborted();
        const options = { signal: controller.signal, timeout: 30000 };
        await client.connect(transport, options);
        const available = await client.listTools(undefined, options);
        if (!available.tools.some(tool => tool.name === name)) {
            throw new Error(`Parallel does not advertise ${name}.`);
        }
        const result = await client.callTool({ name, arguments: {
            ...args,
            ...(ctx.sessionId ? { session_id: ctx.sessionId } : {})
        } }, undefined, options);
        const parsed = CallToolResultSchema.parse(result);
        const text = parsed.content
            .filter((item): item is { type: 'text'; text: string } => item.type === 'text')
            .map(item => item.text).join('\n');
        if (parsed.isError) { throw new Error(text || 'Parallel returned a tool error.'); }
        if (!text.trim()) { throw new Error('Parallel returned no readable content.'); }
        return text.slice(0, 15000);
    } catch (error: any) {
        if (ctx.signal?.aborted) { return 'Web request cancelled.'; }
        if (controller.signal.aborted) { return 'Web request timed out.'; }
        return `Parallel request failed: ${error.message}`;
    } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener('abort', cancel);
        controller.abort();
        await client.close();
    }
}

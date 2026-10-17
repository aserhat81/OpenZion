import * as vscode from 'vscode';
import type { ToolContext } from './index';
import { searchWeb } from './searchWeb';
import { fetchUrl } from './fetchUrl';
import { callParallel } from './parallel';

export async function executeWebTool(name: 'searchWeb' | 'fetchUrl', args: any, ctx: ToolContext): Promise<string> {
    const config = vscode.workspace.getConfiguration('localAgent', vscode.Uri.file(ctx.cwd));
    const provider = config.get<string>('webSearchProvider', 'duckduckgo');
    if (provider === 'disabled') { return 'Web tools are disabled in Local Agent settings.'; }
    if (provider !== 'duckduckgo' && provider !== 'parallel') { return `Unknown web search provider: ${provider}`; }
    if (ctx.signal?.aborted) { return 'Web request cancelled.'; }
    if (name === 'searchWeb') {
        if (typeof args.query !== 'string' || !args.query.trim()) { return 'Search query must not be empty.'; }
        return provider === 'parallel'
            ? callParallel('web_search', { objective: args.query, search_queries: [args.query] }, ctx)
            : searchWeb(args.query, ctx.signal);
    }
    try {
        const url = new URL(args.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) { throw new Error(); }
    } catch { return 'URL must be an HTTP or HTTPS address without credentials.'; }
    return provider === 'parallel'
        ? callParallel('web_fetch', { urls: [args.url] }, ctx)
        : fetchUrl(args.url, ctx.signal);
}

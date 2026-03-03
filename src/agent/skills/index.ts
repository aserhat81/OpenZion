import * as vscode from 'vscode';
import { readFile } from './readFile';
import { editFile } from './editFile';
import { runTerminalCommand } from './runTerminalCommand';
import { searchWeb } from './searchWeb';
import { fetchUrl } from './fetchUrl';

export interface ToolContext {
    cwd: string;
}

export const tools = [
    {
        type: "function",
        function: {
            name: "readFile",
            description: "Read the contents of a file from the local workspace.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Absolute or relative path to the file to read." }
                },
                required: ["filePath"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "editFile",
            description: "Writes or overwrites a file with new content in the workspace.",
            parameters: {
                type: "object",
                properties: {
                    filePath: { type: "string", description: "Absolute or relative path to the file." },
                    content: { type: "string", description: "The content to write into the file." }
                },
                required: ["filePath", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "runTerminalCommand",
            description: "Execute a shell command in the integrated VS Code terminal and return output.",
            parameters: {
                type: "object",
                properties: {
                    command: { type: "string", description: "The bash/shell command to execute." }
                },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "searchWeb",
            description: "Perform a web search to find documentation or solutions online.",
            parameters: {
                type: "object",
                properties: {
                    query: { type: "string", description: "Search query." }
                },
                required: ["query"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetchUrl",
            description: "Download, parse, and extract readable markdown text from a web link. Useful for documentation.",
            parameters: {
                type: "object",
                properties: {
                    url: { type: "string", description: "The URL to fetch." }
                },
                required: ["url"]
            }
        }
    }
];

export async function executeTool(name: string, args: any, context: ToolContext): Promise<string> {
    try {
        switch (name) {
            case 'readFile': return await readFile(args.filePath, context);
            case 'editFile': return await editFile(args.filePath, args.content, context);
            case 'runTerminalCommand': return await runTerminalCommand(args.command, context);
            case 'searchWeb': return await searchWeb(args.query);
            case 'fetchUrl': return await fetchUrl(args.url);
            default: return `Error: Tool ${name} not found.`;
        }
    } catch (e: any) {
        return `Error executing tool ${name}: ${e.message}`;
    }
}

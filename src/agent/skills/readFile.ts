import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ToolContext } from './index';

export async function readFile(filePath: string, context: ToolContext): Promise<string> {
    const fullPath = path.resolve(context.cwd, filePath);
    try {
        const content = fs.readFileSync(fullPath, 'utf8');
        return content;
    } catch (e: any) {
        throw new Error(`Failed to read file: ${e.message}`);
    }
}

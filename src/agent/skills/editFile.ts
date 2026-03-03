import * as path from 'path';
import * as fs from 'fs';
import { ToolContext } from './index';

export async function editFile(filePath: string, content: string, context: ToolContext): Promise<string> {
    const fullPath = path.resolve(context.cwd, filePath);
    try {
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content, 'utf8');
        return `Successfully written to ${filePath}`;
    } catch (e: any) {
        throw new Error(`Failed to write file: ${e.message}`);
    }
}

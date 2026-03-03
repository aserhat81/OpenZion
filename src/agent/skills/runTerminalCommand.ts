import * as vscode from 'vscode';
import { exec } from 'child_process';
import { ToolContext } from './index';

let outputChannel: vscode.OutputChannel | undefined;

export async function runTerminalCommand(command: string, context: ToolContext): Promise<string> {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Local Agent Terminal');
    }
    outputChannel.show(true);
    outputChannel.appendLine(`\n$ ${command}`);

    return new Promise((resolve) => {
        exec(command, { cwd: context.cwd, timeout: 60000 }, (error, stdout, stderr) => {
            let output = '';
            if (stdout) {
                output += stdout;
                outputChannel?.append(stdout);
            }
            if (stderr) {
                output += '\n-- STDERR --\n' + stderr;
                outputChannel?.append(stderr);
            }
            if (error) {
                output += `\n-- ERROR --\n${error.message}`;
                outputChannel?.appendLine(`Error: ${error.message}`);
            }

            if (!output.trim()) {
                resolve('Command executed successfully with no output.');
            } else {
                resolve(output.substring(0, 10000)); // Limit output length
            }
        });
    });
}

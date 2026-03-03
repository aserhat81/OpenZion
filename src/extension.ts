import * as vscode from 'vscode';
import { AgentSidebarProvider } from './AgentSidebarProvider';

export function activate(context: vscode.ExtensionContext) {
    const sidebarProvider = new AgentSidebarProvider(context.extensionUri);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            "localAgent.chatView",
            sidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );
}

export function deactivate() { }

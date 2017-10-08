// Copyright (C) 2016  Patrick Maué
// 
// This file is part of vscode-journal.
// 
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
// 
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
// 
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.
// 
import * as vscode from 'vscode';


import * as J from './';
import * as Q from 'q';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';

'use strict';

const MARKDOWN_MODE: vscode.DocumentFilter = { language: 'markdown', scheme: 'file' };

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    console.log('vscode-journal is now active!');

    let config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration("journal");
    let journal = new J.Main(config);


    let startup = new JournalStartup(context, journal);
    startup.registerCommands()
        .then(() => startup.runServer())
        .then(() => startup.registerViews())
        .then(() => startup.configureDevMode())
        .catch((error) => {
            console.error(error); 
            startup.showError(error); 
        }); 

}

class JournalStartup {
    /**
     *
     */
    constructor(public context: vscode.ExtensionContext, public journal: J.Main) { }


    public registerProviders(): Q.Promise<void> {
        var deferred: Q.Deferred<void> = Q.defer<void>();

        Q.fcall(() => {
            try {
                this.context.subscriptions.push(
                    vscode.languages.registerCompletionItemProvider(MARKDOWN_MODE, new J.Extension.JournalCompletionProvider()),
                    // Vvscode.languages.registerCodeActionsProvider(MARKDOWN_MODE, new journal.JournalCodeActionProvider())
                );

                new J.Extension.JournalActionsProvider().activate(this.context.subscriptions);
                deferred.resolve(null);
            } catch (error) {
                deferred.reject(error);
            }

        });


        return deferred.promise;
    }

    public registerViews(): Q.Promise<void> {
        var deferred: Q.Deferred<void> = Q.defer<void>();

        let tasksView: J.Extension.TasksView = new J.Extension.TasksView(this.journal.getConfig());

        tasksView.init()
            .then(() => {
                vscode.window.registerTreeDataProvider('journalTasksView', tasksView);
                deferred.resolve(null);
            })
            .catch(deferred.reject);

        return deferred.promise;

    }

    public registerCommands():  Q.Promise<void> {
        var deferred: Q.Deferred<void> = Q.defer<void>();

        Q.fcall((_context, _journal) => {
            _context.subscriptions.push(
                vscode.commands.registerCommand('journal.today', () => {
                    _journal.openDay(0).catch(error => this.showError(error));
                }),
                vscode.commands.registerCommand('journal.yesterday', () => {
                    _journal.openDay(-1).catch(error => this.showError(error));
                }),
                vscode.commands.registerCommand('journal.tomorrow', () => {
                    _journal.openDay(1).catch(error => this.showError(error));
                }),
                vscode.commands.registerCommand('journal.day', () => {
                    _journal.openDayByInput().catch(error => this.showError(error));
                }),
                vscode.commands.registerCommand('journal.memo', () => {
                    _journal.openDayByInput().catch(error => this.showError(error));
                }),
                vscode.commands.registerCommand('journal.note', () => {
                    _journal.createNote().catch(error => this.showError(error));
                }),
                vscode.commands.registerCommand('journal.open', () => {
                    _journal.openJournal().catch(error => this.showError(error));
                }),
            );

            deferred.resolve(null);

        }, this.context, this.journal);
        return deferred.promise;


    }

    public runServer(): Thenable<void> {
        var deferred: Q.Deferred<void> = Q.defer<void>();
        Q.fcall((_context, _journal) => {
            try {
                // see https://github.com/Microsoft/vscode-languageserver-node-example/blob/master/client/src/extension.ts
                let serverModule = _context.asAbsolutePath(path.join('out', 'server', 'lang-server.js'));
                let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

                let serverOptions: ServerOptions = {
                    run: { module: serverModule, transport: TransportKind.ipc },
                    debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
                }

                let clientOptions: LanguageClientOptions = {
                    documentSelector: ['markdown', 'asciidoc'],
                    synchronize: {
                        configurationSection: 'vscode-journal',
                        fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
                    }
                }

                let client = new LanguageClient('vscode-journal-client', 'VSCode-Journal Client', serverOptions, clientOptions);


                let disposable = client.start();
                client.onReady().then(() => {
                    this.registerServerCommand(client, "journal.completeTask", "codeActions:completeTask", _context);
                    _context.subscriptions.push(disposable);
                });

                console.log("vscode-journal Language Server started. Pushing message");
                deferred.resolve(null);

            } catch (error) {
                deferred.reject(error);
            }
        },
            this.context,
            this.journal
        );


        return deferred.promise;
    }

    public configureDevMode(): Thenable<void> {
        var deferred: Q.Deferred<void> = Q.defer<void>();

        Q.fcall((_context, _journal) => {
            if (_journal.getConfig().isDevEnabled()) {
                _context.subscriptions.push(
                    vscode.commands.registerCommand('journal.test', function () {
                        // The code you place here will be executed every time your command is executed

                        function delayedQuickPickItems() {
                            return new Promise((resolve, reject) => {
                                setTimeout(() => resolve(['aaaa', 'bbbb', 'cccc', 'abc', 'bcd']), 2000)
                            })
                        }

                        // Display a message box to the user
                        // vscode.window.showQuickPick(delayedQuickPickItems()).then(x => vscode.window.showInformationMessage(x))
                    }),
                    vscode.commands.registerCommand('journal.day2', () => {
                        // journal.openDayByInputOrSelection().catch(reason => vscode.window.showErrorMessage(reason));
                    })
                );
            }

        }, this.context, this.journal);
        return deferred.promise;
    }

    /**
     * See https://github.com/alanz/vscode-hie-server/blob/master/src/extension.ts for inspiration
     * 
     * @param langClient 
     * @param name 
     * @param command 
     * @param context 
     */
    private registerServerCommand(langClient: LanguageClient, name: string, command: string, context: vscode.ExtensionContext) {
        let cmd2 = vscode.commands.registerTextEditorCommand(name, (editor, edit) => {
            let cmd = {
                command: command,
                arguments: [
                    {
                        file: editor.document.uri.toString(),
                        pos: editor.selections[0].active
                    }
                ]
            };

            langClient.sendRequest("workspace/executeCommand", cmd).then(hints => {
                return true;
            }, e => {
                console.error(e);
            });
        });
        context.subscriptions.push(cmd2)
    }

    public showError(error: string | Q.Promise<string>): void {
        (<Q.Promise<string>>error).then((value) => {
            // conflict between Q.IPromise and vscode.Thenable
            vscode.window.showErrorMessage(value);
        });
    }

}




// this method is called when your extension is deactivated
export function deactivate() {

}

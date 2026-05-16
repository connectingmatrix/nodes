import { type PackageLauncherPanel, type RequestContext } from './contracts.js';
export declare function createConnectingmatrixNodesStubLauncher(context?: RequestContext): PackageLauncherPanel;
export declare const createStubLauncher: typeof createConnectingmatrixNodesStubLauncher;
export declare const Launcher: {
    open: typeof createConnectingmatrixNodesStubLauncher;
    mode: "stub";
};
export declare const launcher: typeof createConnectingmatrixNodesStubLauncher;

export interface CreateAppOptions {
  getSocketServer?: (() => unknown) | null;
}

export interface CreateHttpsServerOptions {
  app?: unknown;
  projectRoot?: string;
}

export interface HttpsRuntime {
  app: unknown;
  server: unknown;
  socketServer: unknown;
}

export const app: unknown;

export function createApp(options?: CreateAppOptions): unknown;
export function createHttpsServer(options?: CreateHttpsServerOptions): Promise<HttpsRuntime>;
export function installProcessHandlers(options?: { exit?: (code?: number) => void }): void;
export function startServer(port?: string | number): Promise<unknown>;
export function stopServer(options?: { exit?: (code?: number) => void }): void;

declare const _default: {
  app: unknown;
  createApp: typeof createApp;
  createHttpsServer: typeof createHttpsServer;
  installProcessHandlers: typeof installProcessHandlers;
  startServer: typeof startServer;
  stopServer: typeof stopServer;
};

export default _default;

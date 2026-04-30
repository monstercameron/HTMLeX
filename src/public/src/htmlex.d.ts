export interface HTMLeXLifecycleContext {
  element: Element;
  event: Event | null;
  hookAttributeName: string;
  hookName: string;
  hookScope: string;
  rawValue: string | null;
}

export type HTMLeXLifecycleCallback = (context: HTMLeXLifecycleContext) => void;

export interface HTMLeXHookRegistrationOptions {
  owner?: string;
  replace?: boolean;
  scope?: string;
}

export interface HTMLeXHookUnregisterOptions {
  callback?: HTMLeXLifecycleCallback;
  owner?: string;
  scope?: string;
}

export interface HTMLeXHookScope {
  register(name: string, callback: HTMLeXLifecycleCallback, options?: Omit<HTMLeXHookRegistrationOptions, 'scope'>): () => boolean;
  unregister(name: string, options?: Omit<HTMLeXHookUnregisterOptions, 'scope'>): boolean;
  list(): string[];
}

export interface HTMLeXHooks {
  register(name: string, callback: HTMLeXLifecycleCallback, options?: HTMLeXHookRegistrationOptions): () => boolean;
  unregister(name: string, options?: HTMLeXHookUnregisterOptions): boolean;
  list(scope?: string): string[];
  scope(scope: string): HTMLeXHookScope;
}

export interface DefineHTMLeXElementOptions {
  baseClass?: typeof HTMLElement;
  elementClass?: CustomElementConstructor;
}

export const hooks: HTMLeXHooks;

export function initHTMLeX(): void;
export function registerLifecycleHook(name: string, callback: HTMLeXLifecycleCallback, options?: HTMLeXHookRegistrationOptions): () => boolean;
export function unregisterLifecycleHook(name: string, options?: HTMLeXHookUnregisterOptions): boolean;
export function getLifecycleHookNames(scope?: string): string[];
export function createLifecycleHookScope(scope: string): HTMLeXHookScope;
export function createHTMLeXElementClass<TBase extends typeof HTMLElement = typeof HTMLElement>(baseClass?: TBase): CustomElementConstructor;
export function defineHTMLeXElement(name?: string, options?: DefineHTMLeXElementOptions): CustomElementConstructor;

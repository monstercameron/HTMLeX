export interface HTMLeXAttrs {
  GET?: string;
  POST?: string;
  PUT?: string;
  DELETE?: string;
  PATCH?: string;
  [attributeName: string]: string | number | boolean | null | undefined;
}

export interface HTMLeXNode {
  tag: string;
  attrs: HTMLeXAttrs;
  children: Array<HTMLeXRenderable>;
}

export interface HTMLeXRawHtml {
  html: string;
}

export type HTMLeXRenderable = HTMLeXNode | HTMLeXRawHtml | string | number | boolean | null | undefined | HTMLeXRenderable[];
export type HTMLeXTagFactory = (attrs?: HTMLeXAttrs, ...children: HTMLeXRenderable[]) => HTMLeXNode;

export const tagNames: string[];
export const tags: Record<string, HTMLeXTagFactory>;
export const div: HTMLeXTagFactory;
export const button: HTMLeXTagFactory;
export const span: HTMLeXTagFactory;
export const p: HTMLeXTagFactory;
export const a: HTMLeXTagFactory;

export function escapeHtml(value: unknown): string;
export function escapeAttribute(value: unknown): string;
export function rawHtml(html: string): HTMLeXRawHtml;
export function tag(tagName: string, attrs?: HTMLeXAttrs, ...children: HTMLeXRenderable[]): HTMLeXNode;
export function render(node: HTMLeXRenderable): string;
export function createFragment(content: HTMLeXRenderable, status?: string): HTMLeXNode;
export function generateFragment(target: string, content: HTMLeXRenderable, status?: string): HTMLeXNode;
export function renderFragment(target: string, htmlContent: string, fragmentAttributes?: string | HTMLeXAttrs): string;

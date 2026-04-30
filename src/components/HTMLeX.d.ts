declare const rawHtmlBrand: unique symbol;

export interface HTMLeXAttrs {
  GET?: string;
  POST?: string;
  PUT?: string;
  DELETE?: string;
  PATCH?: string;
  [attributeName: string]: HTMLeXAttributeValue;
}

export interface HTMLeXNode {
  tag: string;
  attrs: HTMLeXAttrs;
  children: Array<HTMLeXRenderable>;
}

export interface HTMLeXRawHtml {
  readonly [rawHtmlBrand]: true;
  html: string;
}

export type HTMLeXAttributeValue = string | number | bigint | boolean | null | undefined;
export type HTMLeXRenderable = HTMLeXNode | HTMLeXRawHtml | HTMLeXAttributeValue | readonly HTMLeXRenderable[];
export type HTMLeXFragmentAttributes = HTMLeXAttrs | HTMLeXAttributeValue;
export interface HTMLeXTagFactory {
  (attrs?: HTMLeXAttrs | null, ...children: HTMLeXRenderable[]): HTMLeXNode;
  (...children: HTMLeXRenderable[]): HTMLeXNode;
}

export const tagNames: string[];
export const tags: Record<string, HTMLeXTagFactory>;
export const div: HTMLeXTagFactory;
export const button: HTMLeXTagFactory;
export const span: HTMLeXTagFactory;
export const p: HTMLeXTagFactory;
export const a: HTMLeXTagFactory;

export function escapeHtml(value: unknown): string;
export function escapeAttribute(value: unknown): string;
export function rawHtml(html: unknown): HTMLeXRawHtml;
export function tag(tagName: string, attrs?: HTMLeXAttrs | null, ...children: HTMLeXRenderable[]): HTMLeXNode;
export function tag(tagName: string, ...children: HTMLeXRenderable[]): HTMLeXNode;
export function render(node: HTMLeXRenderable): string;
export function createFragment(content: HTMLeXRenderable, status?: HTMLeXAttributeValue): HTMLeXNode;
export function generateFragment(target: string, content: HTMLeXRenderable, status?: HTMLeXAttributeValue): HTMLeXNode;
export function renderFragment(target: string, htmlContent: unknown, fragmentAttributes?: HTMLeXFragmentAttributes): string;

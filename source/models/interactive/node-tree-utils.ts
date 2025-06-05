import type { DOMElement } from "ink";

export type InkNode = DOMElement["childNodes"][number];
export type TextNode = Extract<
	DOMElement["childNodes"][number],
	{ nodeName: "#text" }
>;

export function isBoxNode(node: InkNode): node is DOMElement {
	return node.nodeName === "ink-box";
}

export function isTextNode(node: InkNode): node is TextNode {
	return node.nodeName === "#text" || node.nodeName === "ink-virtual-text";
}

export function isRootNode(node: InkNode): node is DOMElement {
	return node.nodeName === "ink-root";
}

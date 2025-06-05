import type { DOMElement } from "ink";
import { BlurEvent, type Event, FocusEvent, type InputEvent } from "./event";
import { FocusManager } from "./focus";

export interface Node extends EventTarget {
	parent?: Node;
	children: Node[];
	element?: DOMElement;

	connect(): void;
	disconnect(): void;
}

class WindowNode implements Node {
	readonly id = "ROOT";
	#connectionController = new AbortController();
	#eventTarget: EventTarget = new EventTarget();
	#focusManager = new FocusManager(this);

	parent: undefined;
	children: Node[] = [];

	connect(): void {}

	disconnect(): void {
		this.#connectionController.abort();
	}

	addEventListener(
		type: "input",
		callback: ((event: InputEvent) => void) | EventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void;
	addEventListener(
		type: "focus",
		callback: ((event: FocusEvent) => void) | EventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void;
	addEventListener(
		type: "blur",
		callback: ((event: BlurEvent) => void) | EventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void;
	addEventListener(
		type:
			| "mouse-down"
			| "mouse-up"
			| "mouse-move"
			| "mouse-enter"
			| "mouse-leave"
			| "click",
		callback: ((event: MouseEvent) => void) | EventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void;
	addEventListener(
		type: string,
		callback: EventListenerOrEventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void {
		this.#eventTarget.addEventListener(type, callback, options);
	}

	dispatchEvent(event: Event): boolean {
		return this.#eventTarget.dispatchEvent(event);
	}

	dispatchEventFromTarget(target: Node, event: Event): boolean {
		const path = [];
		let current: Node | undefined = target.parent;
		while (current) {
			path.push(current);
			current = current.parent;
		}

		// event.eventPhase = event.CAPTURING_PHASE;
		// windowNode.dispatchEvent(event);
		// for (const node of path) {
		//   node.#eventTarget.dispatchEvent(event);
		// }

		event.eventPhase = event.AT_TARGET;
		event.target = target;
		target.dispatchEvent(event);

		if (event.bubbles) {
			event.eventPhase = event.BUBBLING_PHASE;
			for (const node of path) {
				node.dispatchEvent(event);
			}
		}
		return !event.defaultPrevented;
	}

	removeEventListener(
		type: string,
		callback: EventListenerOrEventListenerObject | null,
		options?: EventListenerOptions | boolean
	): void {
		this.#eventTarget.removeEventListener(type, callback, options);
	}

	focus() {
		this.#focusManager.focus();
	}

	focusNext() {
		this.#focusManager.focusNext();
	}

	focusPrevious() {
		this.#focusManager.focusPrevious();
	}

	get activeElement() {
		return this.#focusManager.currentNode ?? this;
	}
}

// Attach WindowNode to globalThis
globalThis.windowNode = new WindowNode();
globalThis.windowNode.connect();

globalThis.windowNode.addEventListener("input", (event) => {
	const evt = event as InputEvent;
	if (evt.key.tab) {
		if (evt.key.shift) {
			globalThis.windowNode.focusPrevious();
		} else {
			globalThis.windowNode.focusNext();
		}
	}
});

let activeNode: Node = globalThis.windowNode;

export function focus(node: Node) {
	if (activeNode === node) return;

	if (activeNode) {
		blur(activeNode);
	}

	activeNode = node;
	node.dispatchEvent(new FocusEvent());
}

export function blur(node: Node) {
	if (activeNode === node) {
		activeNode?.dispatchEvent(new BlurEvent());
		activeNode = windowNode;
	}
}

declare global {
	var windowNode: WindowNode;
}

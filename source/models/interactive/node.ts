import type { DOMElement } from "ink";
import {
	BlurEvent,
	type Event,
	FocusEvent,
	type InputEvent,
	type MouseEvent,
} from "./event";
import { FocusManager } from "./focus";
import { log } from "../../utilities/logging/logger";
import type { FocusableNode } from "./interactive";
import {
	normalizeOptions,
	retrieveWrappedListener,
	wrapCaptureListener,
} from "./event-listener-utils";

export interface Node extends EventTarget {
	id: string;
	parent?: Node;
	children: Node[];
	element?: DOMElement | null;

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

	connect(): void {
		// Handle tab navigation when no focus groups are active
		this.addEventListener(
			"input",
			(event) => {
				// Only handle if window itself is focused (no focus groups active)
				if (this.activeElement !== this) return;

				const { key } = event;

				if (key.tab) {
					event.stopImmediatePropagation();

					log("window-level tab navigation", { shift: key.shift });

					if (key.shift) {
						this.focusPrevious();
					} else {
						this.focusNext();
					}
				}
			},
			{ signal: this.#connectionController.signal }
		);
	}

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
		listener: EventListenerOrEventListenerObject | null,
		options?: AddEventListenerOptions | boolean
	): void {
		const wrappedListener = wrapCaptureListener(listener, options);
		this.#eventTarget.addEventListener(type, wrappedListener, options);
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

		// Capturing phase - from root to target
		event.eventPhase = event.CAPTURING_PHASE;
		event.target = target;

		// Then dispatch on each parent from root to target
		for (let i = path.length - 1; i >= 0; i--) {
			const node = path[i];
			if (node) {
				node.dispatchEvent(event);
				if (event.propagationStopped) {
					return !event.defaultPrevented;
				}
			}
		}

		// Target phase
		event.eventPhase = event.AT_TARGET;
		target.dispatchEvent(event);

		// Bubbling phase - only if event bubbles
		if (event.bubbles && !event.propagationStopped) {
			event.eventPhase = event.BUBBLING_PHASE;
			for (const node of path) {
				node.dispatchEvent(event);
				if (event.propagationStopped) {
					break;
				}
			}
		}
		return !event.defaultPrevented;
	}

	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject | null,
		options?: EventListenerOptions | boolean
	): void {
		this.#eventTarget.removeEventListener(
			type,
			retrieveWrappedListener(listener),
			options
		);
	}

	focus(node: FocusableNode) {
		focus(node);
	}

	blur(node: FocusableNode) {
		blur(node);
	}

	focusNext() {
		this.#focusManager.focusNext();
	}

	focusPrevious() {
		this.#focusManager.focusPrevious();
	}

	get activeElement() {
		return activeNode;
	}
}

// Attach WindowNode to globalThis
globalThis.windowNode = new WindowNode();
globalThis.windowNode.connect();

let activeNode: Node = globalThis.windowNode;

export function focus(node: Node) {
	if (activeNode === node) return;

	if (activeNode) {
		blur(activeNode);
	}

	activeNode = node;
	globalThis.windowNode.dispatchEventFromTarget(node, new FocusEvent());
}

export function blur(node: Node) {
	if (activeNode === node) {
		globalThis.windowNode.dispatchEventFromTarget(node, new BlurEvent());
		activeNode = windowNode;
	}
}

declare global {
	var windowNode: WindowNode;
}

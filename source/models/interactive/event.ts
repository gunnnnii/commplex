import type { Key } from "ink";

const NativeEvent = globalThis.Event;

export class Event extends NativeEvent {
	override eventPhase = 1;
	override CAPTURING_PHASE = 1 as const;
	override AT_TARGET = 2 as const;
	override BUBBLING_PHASE = 3 as const;
	override target!: EventTarget;
}

export class InputEvent extends Event {
	input!: string;
	key!: Key;

	constructor(input: string, key: Key) {
		super("input", { bubbles: true });

		this.input = input;
		this.key = key;
	}
}

export class MouseEvent extends Event {
	x: number;
	y: number;
	button: number;

	constructor(
		type:
			| "mouse-up"
			| "mouse-down"
			| "mouse-move"
			| "mouse-enter"
			| "mouse-leave"
			| "click",
		x: number,
		y: number,
		button: number
	) {
		const bubbles = type !== "mouse-enter" && type !== "mouse-leave";

		super(type, { bubbles });

		this.x = x;
		this.y = y;
		this.button = button;
	}
}

export class FocusEvent extends Event {
	constructor() {
		super("focus", { bubbles: true });
	}
}

export class BlurEvent extends Event {
	constructor() {
		super("blur", { bubbles: true });
	}
}

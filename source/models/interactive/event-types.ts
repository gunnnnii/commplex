import type { InputEvent, FocusEvent, BlurEvent, MouseEvent } from "./event";

export type InputEventListener = (event: InputEvent) => void;
export type FocusEventListener = (event: FocusEvent) => void;
export type BlurEventListener = (event: BlurEvent) => void;
export type MouseEventListener = (event: MouseEvent) => void;

export type GenericEventListener = EventListenerOrEventListenerObject | null;

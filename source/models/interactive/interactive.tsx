import { Box, useInput, useStdin, type DOMElement } from "ink"
import { useEffect, useRef, useState, type ComponentProps, type PropsWithChildren, type RefObject } from "react"
import { isTextNode } from "./node-tree-utils";
import { anyMaybeSignals, getSignalFromOptions, normalizeOptions } from "./event-listener-utils";
import { type Event, InputEvent, MouseEvent, type FocusEvent, type BlurEvent } from "./event";
import { blur, focus, type Node } from "./node";
import { isPointInElement } from "../../utilities/layout-measurements";
import type { InputEventListener, FocusEventListener, BlurEventListener, MouseEventListener } from './event-types';
import { log } from "../../utilities/logging/logger";

const tree = new Map<DOMElement, InteractionNode>();

function handleNodeAddedToTree(node: InteractionNode) {
  // If this is a focusable node and nothing is currently focused, focus it
  if (node instanceof FocusableNode) {
    const currentlyFocused = globalThis.windowNode.activeElement;
    if (currentlyFocused === globalThis.windowNode) {
      // Nothing is focused, focus this new focusable node
      node.focus();
    }
  }
}

export class InteractionNode implements Node {
  id: string = crypto.randomUUID();
  #connectionController = new AbortController();
  #eventTarget = new EventTarget();
  #element: DOMElement | null = null;
  #parent: Node | null = null;
  children: Node[] = [];

  get signal(): AbortSignal {
    return this.#connectionController.signal;
  }

  get parent(): Node {
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    return this.#parent!;
  }

  private set parent(newParent: Node) {
    this.#parent = newParent;
  }

  get element(): DOMElement | null | undefined {
    return this.#element;
  }

  #abort() {
    this.signal.addEventListener('abort', () => {
      this.#connectionController = new AbortController();
    }, { once: true });

    this.#connectionController.abort();
  }

  #updateChildren(node: DOMElement) {
    const queue: DOMElement[] = [node];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      for (const child of current.childNodes) {
        if (isTextNode(child)) continue;

        const childElement = child;

        if (!tree.has(childElement)) {
          // Only enqueue children if no InteractiveNode2 is found
          queue.push(childElement);
        } else {
          // if the node has an interactive node, we can stop traversing the branch and update the parent-child relationships

          // biome-ignore lint/style/noNonNullAssertion: we check for the existence of the node above
          const childInteractionNode = tree.get(childElement)!;

          // Remove child from its current parent
          if (childInteractionNode.parent) {
            const childIndex = childInteractionNode.parent.children.indexOf(childInteractionNode);
            if (childIndex !== -1) {
              childInteractionNode.parent.children.splice(childIndex, 1);
            }
          }
          // Set this node as the new parent
          this.children.push(childInteractionNode);
          childInteractionNode.parent = this;
        }
      }
    }
  }

  #findParentInteractionNode(node: DOMElement): Node {
    let parentNode = node.parentNode;
    let parentInteractionNode: InteractionNode | null = null;
    while (parentNode) {
      parentInteractionNode = tree.get(parentNode as DOMElement) || null;
      if (parentInteractionNode) {
        break;
      }
      parentNode = parentNode.parentNode;
    }

    // If no parent found, return undefined
    return parentInteractionNode ?? windowNode;
  }

  connectElement(node: DOMElement) {
    this.#abort();

    this.#element = node;

    // Use the extracted method to find the correct parent
    const parentInteractionNode = this.#findParentInteractionNode(node);

    // Set the found parent as the parent
    this.parent = parentInteractionNode;
    this.parent.children.push(this);

    tree.set(node, this);

    // Notify WindowNode that a new node has been added
    handleNodeAddedToTree(this);

    // Use the extracted method for child traversal
    this.#updateChildren(node);

    this.connect();
  }

  connect() {
    if (this.#element) {
      this.#eventTarget.addEventListener('mouse-down', async (evt) => {
        const mouseEvent = evt as MouseEvent;

        const x = mouseEvent.x;
        const y = mouseEvent.y;

        this.#eventTarget.addEventListener('mouse-up', async (evt) => {
          const mouseEvent = evt as MouseEvent;

          // the proper implementation of this is a bit more complex, as it would check if the mouse-up happens on the same element - rather then just checking if the coordinates have changed (that is enough for double click though)
          if (mouseEvent.x === x && mouseEvent.y === y) {
            this.dispatchEvent(new MouseEvent('click', x, y, mouseEvent.button));
          }
        }, { signal: this.signal, once: true });
      }, { signal: this.signal })
    }
  }

  disconnect() {
    this.#abort()

    // Make its children root nodes
    for (const child of this.children) {
      child.parent = undefined;
    }

    if (this.#element) {
      tree.delete(this.#element);
    }

    this.#element = null;
  }

  addEventListener(
    type: 'input',
    callback: ((event: InputEvent) => void) | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ): void;
  addEventListener(
    type: 'focus',
    callback: ((event: FocusEvent) => void) | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ): void;
  addEventListener(
    type: 'blur',
    callback: ((event: BlurEvent) => void) | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ): void;
  addEventListener(
    type: 'mouse-down' | 'mouse-up' | 'mouse-move' | 'mouse-enter' | 'mouse-leave' | 'click',
    callback: ((event: MouseEvent) => void) | EventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean
  ): void {
    const normalizedOptions = normalizeOptions(options);
    const signal = anyMaybeSignals([this.signal, getSignalFromOptions(normalizedOptions)]);

    this.#eventTarget.addEventListener(type, callback, { ...normalizedOptions, signal });
  }

  dispatchEvent(event: Event): boolean {
    if (event.target != null) {
      // Event is already being propagated through the tree, just dispatch locally
      if (event.eventPhase === event.CAPTURING_PHASE ||
        (event.eventPhase === event.AT_TARGET && event.target === this) ||
        (event.eventPhase === event.BUBBLING_PHASE && event.target !== this)) {
        return this.#eventTarget.dispatchEvent(event);
      }
      // Don't re-dispatch if we're not part of the current event phase
      return true;
    }

    // Only start new event propagation if this is a fresh event (target is null)
    return windowNode.dispatchEventFromTarget(this, event);
  }

  removeEventListener(type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean
  ): void {
    this.#eventTarget.removeEventListener(type, callback, options);
  }
}

export class FocusableNode extends InteractionNode {
  readonly focusable = true;

  override connectElement(node: DOMElement) {
    try {
      super.connectElement(node);

      let ancestor: Node | undefined = this.parent;

      while (ancestor) {
        if (ancestor instanceof FocusableNode) {
          throw new Error('Focusable nodes cannot be nested inside other focusable nodes');
        }
        ancestor = ancestor.parent;
      }
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  focus() {
    focus(this);
  }

  blur() {
    blur(this);
  }
}

export const FocusRoot = (props: PropsWithChildren<Props>) => {
  useInput((input, key) => {
    // Filter out mouse events - check for SGR mouse tracking patterns
    const isMouseEvent = input.startsWith('\x1b[<') || /^\[<\d+;\d+;\d+[mM]/.test(input);
    if (!isMouseEvent) {
      globalThis.windowNode.activeElement?.dispatchEvent(new InputEvent(input, key));
    }
  });

  const { stdin, setRawMode, isRawModeSupported } = useStdin();

  useEffect(() => {
    if (!isRawModeSupported) return;

    setRawMode(true);

    const enteredElements = new Set<Node>();

    let previousX: number;
    let previousY: number;
    let previousEventCode: number;
    let previousPressed: boolean;

    const handler = (buffer: Buffer<ArrayBufferLike>) => {
      const chunk = buffer.toString()

      // Parse mouse tracking events in SGR mode (\x1b[<code;col;row[mM])
      if (chunk.startsWith('\x1b[<')) {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: SGR mouse tracking format
        const match = /\x1b\[<(\d+);(\d+);(\d+)([mM])/.exec(chunk);
        if (match) {
          const [_, code, col, row, pressRelease] = match;

          if (code == null || col == null || row == null || pressRelease == null) return;

          const eventCode = Number.parseInt(code, 10);
          const pressed = pressRelease === 'M';
          const x = Number.parseInt(col, 10) - 1;
          const y = Number.parseInt(row, 10);

          if (
            previousX === x &&
            previousY === y &&
            previousEventCode === eventCode &&
            previousPressed === pressed
          ) return;

          previousX = x;
          previousY = y;
          previousEventCode = eventCode;
          previousPressed = pressed;

          const children = windowNode.children;

          const queue: Node[] = [...children];
          let target: Node | undefined = undefined;

          while (queue.length > 0) {
            const next = queue.shift();
            if (!next) break;

            const element = next.element;

            if (element) {
              if (isPointInElement(element, x, y)) {
                if (!enteredElements.has(next)) {
                  next.dispatchEvent(new MouseEvent('mouse-enter', x, y, 0));
                  enteredElements.add(next);
                }

                queue.unshift(...next.children);
                target = next;
              } else if (enteredElements.has(next)) {
                next.dispatchEvent(new MouseEvent('mouse-leave', x, y, 0));
                enteredElements.delete(next);
              }
            } else {
              queue.unshift(...next.children);
            }
          }

          target ??= windowNode;

          if (eventCode === 0) {
            target?.dispatchEvent(new MouseEvent(pressed ? 'mouse-down' : 'mouse-up', x, y, 0));
          }
          if (eventCode === 32 || eventCode === 35) {
            target?.dispatchEvent(new MouseEvent('mouse-move', x, y, 0));
          }

        }
      }
    }

    stdin.on('data', handler)

    return () => {
      setRawMode(false);
      stdin.off('data', handler);
    }
  }, [isRawModeSupported, setRawMode, stdin]);


  return props.children;
}

type Props = ComponentProps<typeof Box> & { id?: string, ref?: RefObject<DOMElement | null> };
type ListenerProps = {
  onInput?: InputEventListener;
  onFocus?: FocusEventListener;
  onBlur?: BlurEventListener;
  onMouseDown?: MouseEventListener;
  onMouseUp?: MouseEventListener;
  onMouseMove?: MouseEventListener;
  onMouseEnter?: MouseEventListener;
  onMouseLeave?: MouseEventListener;
  onClick?: MouseEventListener;
}

export const Interactive = (props: PropsWithChildren<Props & ListenerProps>) => {
  const [interactionNode] = useState(() => new InteractionNode());
  const internalRef = useRef<DOMElement>(null);
  const ref = props.ref ?? internalRef;

  useEffect(() => {
    if (props.id) {
      interactionNode.id = props.id;
    }
  }, [interactionNode, props.id]);

  useEffect(() => {
    if (ref.current == null) return;

    interactionNode.connectElement(ref.current);

    return () => {
      interactionNode.disconnect();
    }
  }, [interactionNode, ref]);

  useEventListeners(interactionNode, props);

  return (
    <Box ref={ref} {...props}>
      {props.children}
    </Box>
  )
}

export const Focusable = (props: PropsWithChildren<Props & ListenerProps>) => {
  const [interactionNode] = useState(() => new FocusableNode());
  const internalRef = useRef<DOMElement>(null);
  const ref = props.ref ?? internalRef;

  useEffect(() => {
    if (props.id) {
      interactionNode.id = props.id;
    }
  }, [interactionNode, props.id]);

  useEffect(() => {
    if (ref.current == null) return;

    interactionNode.connectElement(ref.current);

    return () => {
      interactionNode.disconnect();
    }
  }, [interactionNode, ref]);

  useEventListeners(interactionNode, props);

  return (
    <Box ref={ref} {...props}>
      {props.children}
    </Box>
  )
}

function useEventListeners(node: InteractionNode, listeners: ListenerProps) {
  useEffect(() => {
    const controller = new AbortController();

    if (listeners.onInput) {
      node.addEventListener('input', listeners.onInput, { signal: controller.signal });
    }

    if (listeners.onFocus) {
      node.addEventListener('focus', listeners.onFocus, { signal: controller.signal });
    }

    if (listeners.onBlur) {
      node.addEventListener('blur', listeners.onBlur, { signal: controller.signal });
    }

    if (listeners.onMouseDown) {
      node.addEventListener('mouse-down', listeners.onMouseDown, { signal: controller.signal });
    }

    if (listeners.onMouseUp) {
      node.addEventListener('mouse-up', listeners.onMouseUp, { signal: controller.signal });
    }

    if (listeners.onMouseMove) {
      node.addEventListener('mouse-move', listeners.onMouseMove, { signal: controller.signal });
    }

    if (listeners.onMouseEnter) {
      node.addEventListener('mouse-enter', listeners.onMouseEnter, { signal: controller.signal });
    }

    if (listeners.onMouseLeave) {
      node.addEventListener('mouse-leave', listeners.onMouseLeave, { signal: controller.signal });
    }

    if (listeners.onClick) {
      node.addEventListener('click', (event) => {
        listeners.onClick?.(event)

        if (event.defaultPrevented) return;

        if (node instanceof FocusableNode) {
          node.focus();
        }
      }, { signal: controller.signal });
    }

    return () => {
      controller.abort();
    }
  }, [node, listeners]);
}
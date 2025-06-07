import { InteractionNode, FocusableNode } from "./interactive";
import type { InputEvent } from "./event";
import { Box, type DOMElement } from "ink";
import { useEffect, useRef, useState, type ComponentProps, type PropsWithChildren } from "react";
import { createContext, useContext } from "react";
import { log } from "../../utilities/logging/logger";
import { getBoundingClientRect } from "../../utilities/layout-measurements";
import type { Node } from "./node";

export class FocusGroup extends InteractionNode {
  #currentIndex = 0;
  #isActive = false;
  #activeController = new AbortController();

  get focusableChildren(): FocusableNode[] {
    const focusable: FocusableNode[] = [];
    this.traverseForFocusable(this, focusable);
    return this.sortByLayoutOrder(focusable);
  }

  protected sortByLayoutOrder(nodes: FocusableNode[]): FocusableNode[] {
    // Default implementation: return nodes in tree order
    return nodes;
  }

  get currentIndex(): number {
    return this.#currentIndex;
  }

  get currentNode(): FocusableNode | null {
    return this.focusableChildren[this.#currentIndex] || null;
  }

  get isActive(): boolean {
    return this.#isActive;
  }

  private traverseForFocusable(node: InteractionNode, focusable: FocusableNode[]) {
    for (const child of node.children) {
      if (child instanceof FocusableNode) {
        focusable.push(child);
      } else if (child instanceof InteractionNode && !(child instanceof FocusGroup)) {
        this.traverseForFocusable(child, focusable);
      }
    }
  }

  focusNext(): boolean {
    const focusableChildren = this.focusableChildren;
    if (focusableChildren.length === 0) return false;

    const nextIndex = (this.#currentIndex + 1) % focusableChildren.length;
    return this.focusIndex(nextIndex);
  }

  focusPrevious(): boolean {
    const focusableChildren = this.focusableChildren;
    if (focusableChildren.length === 0) return false;

    const prevIndex = (this.#currentIndex - 1 + focusableChildren.length) % focusableChildren.length;
    return this.focusIndex(prevIndex);
  }

  focusIndex(index: number): boolean {
    const focusableChildren = this.focusableChildren;
    if (index >= 0 && index < focusableChildren.length) {
      this.#currentIndex = index;
      const node = focusableChildren[index];
      if (node) {
        node.focus();
        return true;
      }
    }
    return false;
  }

  override connect(): void {
    super.connect();

    this.#setupFocusListeners();

    // Check if any child is already focused and activate if so
    const focusableChildren = this.focusableChildren;
    const activeElement = globalThis.windowNode.activeElement;

    if (activeElement) {
      const focusedIndex = focusableChildren.indexOf(activeElement as FocusableNode);
      if (focusedIndex !== -1) {
        this.#currentIndex = focusedIndex;
        this.#activate();
      }
    }

    // If no element is focused globally, focus the first element in the first group
    if (activeElement === globalThis.windowNode && focusableChildren.length > 0) {
      const firstChild = focusableChildren[0];
      if (firstChild) {
        firstChild.focus();
      }
    }
  }

  override disconnect(): void {
    super.disconnect();

    this.#isActive = false;
    this.#activeController.abort();
    this.#activeController = new AbortController();
  }

  #setupFocusListeners(): void {
    // Listen for focus events on any focusable children
    this.addEventListener('focus', (event) => {
      if (event.eventPhase !== event.CAPTURING_PHASE) return;

      const target = event.target as FocusableNode;
      const focusableChildren = this.focusableChildren;
      const index = focusableChildren.indexOf(target);

      if (index !== -1) {
        this.#currentIndex = index;
        this.#activate();
      }
    }, { signal: this.signal, capture: true });

    this.addEventListener('blur', (event) => {
      if (event.eventPhase !== event.CAPTURING_PHASE) return;

      // Check if focus is moving to another node in our group
      setImmediate(() => {
        const focusableChildren = this.focusableChildren;
        const anyFocused = focusableChildren.some((n: FocusableNode) => n === globalThis.windowNode.activeElement);

        if (!anyFocused) {
          log("no focus in group, deactivating", this.id);
          this.#deactivate();
        }
      });
    }, { signal: this.signal, capture: true });
  }

  #activate(): void {
    if (!this.#isActive) {
      log("activating", this.id);

      this.#isActive = true;
      this.setupKeyboardListeners();
    }
  }

  #deactivate(): void {
    if (this.#isActive) {
      log("deactivating", this.id);
      this.#isActive = false;
      this.#activeController.abort();
      this.#activeController = new AbortController();
    }
  }

  protected get keyboardAbortController(): AbortController {
    return this.#activeController;
  }

  protected setupKeyboardListeners(): void {
    // Handle tab navigation between focus groups
    globalThis.windowNode.addEventListener('input', (event) => {
      if (!this.isActive) return;
      log('propagation stopped', this.id, event.propagationStopped);

      const inputEvent = event as InputEvent;
      const { key } = inputEvent;

      if (key.tab) {
        if (key.shift) {
          this.navigateToPreviousGroup();
        } else {
          this.navigateToNextGroup();
        }

        event.stopPropagation();
      }
    }, { signal: this.keyboardAbortController.signal });
  }

  private navigateToNextGroup(): void {
    const nextGroup = this.findNextFocusGroup();
    const firstChild = nextGroup?.focusableChildren.at(0);
    if (nextGroup && nextGroup !== this && firstChild) {
      log("navigating to next group - deactivating", this.id, nextGroup.id);
      // Only deactivate after confirming we have a valid next group
      this.#deactivate();

      // Focus the first focusable child in the next group
      firstChild.focus();
    } else {
      log("no next group, focusing first child", this.id);
      this.focusableChildren.at(0)?.focus();
    }
  }

  private navigateToPreviousGroup(): void {
    const prevGroup = this.findPreviousFocusGroup();
    const firstChild = prevGroup?.focusableChildren.at(0);
    if (prevGroup && prevGroup !== this && firstChild) {
      log("navigating to prev group - deactivating", this.id, prevGroup.id);
      // Only deactivate after confirming we have a valid previous group
      this.#deactivate();

      // Focus the first focusable child in the previous group
      firstChild.focus();
    } else {
      log("no prev group, focusing last child", this.id);
      this.focusableChildren.at(-1)?.focus();
    }
  }

  private findNextFocusGroup(): FocusGroup | null {
    // 1. First try to find child groups
    const childGroups = this.getChildFocusGroups();
    const firstChildGroup = childGroups.at(0);
    if (firstChildGroup) {
      return firstChildGroup; // First child group
    }

    // 2. Then try sibling groups
    const siblingGroups = this.getSiblingFocusGroups();
    const currentIndex = siblingGroups.indexOf(this);
    if (currentIndex !== -1 && currentIndex < siblingGroups.length - 1) {
      return siblingGroups.at(currentIndex + 1) ?? null; // Next sibling
    }

    // 3. Finally, traverse up to parent and find its next group
    const parent = this.getParentFocusGroup();
    if (parent) {
      return parent.findNextFocusGroup();
    }

    return null;
  }

  private findPreviousFocusGroup(): FocusGroup | null {
    // 1. Try previous sibling groups
    const siblingGroups = this.getSiblingFocusGroups();
    const currentIndex = siblingGroups.indexOf(this);
    if (currentIndex > 0) {
      const prevSibling = siblingGroups.at(currentIndex - 1);
      if (prevSibling) {
        // Find the deepest last child group of the previous sibling
        return this.findDeepestLastChildGroup(prevSibling);
      }
    }

    // 2. Go to parent group
    return this.getParentFocusGroup();
  }

  private findDeepestLastChildGroup(group: FocusGroup): FocusGroup {
    const childGroups = group.getChildFocusGroups();
    if (childGroups.length === 0) {
      return group; // No children, return this group
    }

    const lastChild = childGroups.at(-1);
    if (lastChild) {
      return this.findDeepestLastChildGroup(lastChild); // Recurse into last child
    }
    return group;
  }

  private getChildFocusGroups(): FocusGroup[] {
    const childGroups: FocusGroup[] = [];

    for (const child of this.children) {
      if (child instanceof FocusGroup) {
        childGroups.push(child);
      } else if (child instanceof InteractionNode) {
        // Recursively find focus groups in child trees
        childGroups.push(...this.findFocusGroupsInSubtree(child));
      }
    }

    return this.sortGroupsByPosition(childGroups);
  }

  private getSiblingFocusGroups(): FocusGroup[] {
    const parent = this.getParentFocusGroup();
    if (!parent) {
      // No parent, find all root-level focus groups
      return this.findAllRootFocusGroups();
    }

    return parent.getChildFocusGroups();
  }

  private getParentFocusGroup(): FocusGroup | null {
    let current: Node | undefined = this.parent;
    while (current) {
      if (current instanceof FocusGroup) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  private findFocusGroupsInSubtree(node: InteractionNode): FocusGroup[] {
    const groups: FocusGroup[] = [];

    for (const child of node.children) {
      if (child instanceof FocusGroup) {
        groups.push(child);
      } else if (child instanceof InteractionNode) {
        groups.push(...this.findFocusGroupsInSubtree(child));
      }
    }

    return groups;
  }

  private findAllRootFocusGroups(): FocusGroup[] {
    // Find all focus groups that don't have a focus group parent
    const allGroups = this.findAllFocusGroups();
    return allGroups.filter(group => group.getParentFocusGroup() === null);
  }

  private findAllFocusGroups(): FocusGroup[] {
    const groups: FocusGroup[] = [];
    this.traverseTreeForGroups(globalThis.windowNode, groups);
    return this.sortGroupsByPosition(groups);
  }

  private traverseTreeForGroups(node: Node, groups: FocusGroup[]): void {
    if (node instanceof FocusGroup) {
      groups.push(node);
    }

    if (node.children) {
      for (const child of node.children) {
        this.traverseTreeForGroups(child, groups);
      }
    }
  }

  private sortGroupsByPosition(groups: FocusGroup[]): FocusGroup[] {
    return groups.toSorted((a, b) => {
      const aPos = this.getGroupPosition(a);
      const bPos = this.getGroupPosition(b);

      if (!aPos || !bPos) return 0;

      // Sort left to right, then top to bottom
      const yDiff = aPos.top - bPos.top;
      if (Math.abs(yDiff) > 5) { // Allow some tolerance for same "row"
        return yDiff;
      }

      return aPos.left - bPos.left;
    });
  }

  private getGroupPosition(group: FocusGroup): { top: number; left: number } | null {
    const focusableChildren = group.focusableChildren;

    if (focusableChildren.length === 0) {
      return null;
    }

    let minTop = Number.POSITIVE_INFINITY;
    let minLeft = Number.POSITIVE_INFINITY;

    for (const child of focusableChildren) {
      const element = child.element;
      if (element) {
        const rect = getBoundingClientRect(element);
        if (rect) {
          minTop = Math.min(minTop, rect.top);
          minLeft = Math.min(minLeft, rect.left);
        }
      }
    }

    if (minTop === Number.POSITIVE_INFINITY || minLeft === Number.POSITIVE_INFINITY) {
      return null;
    }

    return { top: minTop, left: minLeft };
  }
}

export class ListFocusGroup extends FocusGroup {
  orientation: 'horizontal' | 'vertical';

  constructor(orientation: 'horizontal' | 'vertical' = 'vertical') {
    super();
    this.orientation = orientation;
  }

  protected override sortByLayoutOrder(nodes: FocusableNode[]): FocusableNode[] {
    // Sort nodes based on their actual layout position
    return nodes.toSorted((a, b) => {
      const aElement = a.element;
      const bElement = b.element;

      if (!aElement || !bElement) return 0;

      const aRect = getBoundingClientRect(aElement) ?? 0;
      const bRect = getBoundingClientRect(bElement) ?? 0;

      if (this.orientation === 'vertical') {
        const yDiff = aRect.top - bRect.top;
        if (yDiff !== 0) {
          return yDiff;
        }
      }

      const xDiff = aRect.left - bRect.left;

      return xDiff;
    });
  }

  protected override setupKeyboardListeners(): void {
    // First set up the base tab navigation
    super.setupKeyboardListeners();
    // Then add arrow key navigation for this list
    globalThis.windowNode.addEventListener('input', (event) => {
      if (!this.isActive) return;

      const inputEvent = event as InputEvent;
      const { key } = inputEvent;

      // Handle navigation based on orientation
      const isNext = this.orientation === 'vertical' ? key.downArrow : key.rightArrow;
      const isPrev = this.orientation === 'vertical' ? key.upArrow : key.leftArrow;

      if (isNext) {
        this.focusNext(); // Always cycles within the group
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (isPrev) {
        this.focusPrevious(); // Always cycles within the group
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }, { signal: this.keyboardAbortController.signal });
  }
}

const FocusGroupContext = createContext<FocusGroup | null>(null);

export const useFocusGroup = () => {
  return useContext(FocusGroupContext);
};

export const FocusGroupComponent = (props: PropsWithChildren<ComponentProps<typeof Box>>) => {
  const { children, ref: propRef, ...boxProps } = props;
  const [group] = useState(() => new FocusGroup());
  const internalRef = useRef<DOMElement>(null);
  const ref = propRef ?? internalRef;

  useEffect(() => {
    if (!ref || typeof ref === 'function') return;
    if (ref.current == null) return;

    group.connectElement(ref.current);

    return () => {
      group.disconnect();
    };
  }, [group, ref]);

  return (
    <FocusGroupContext.Provider value={group}>
      <Box ref={ref} {...boxProps}>
        {children}
      </Box>
    </FocusGroupContext.Provider>
  );
};

type ListProps = ComponentProps<typeof Box> & {
  orientation?: 'horizontal' | 'vertical';
};

export const List = (props: PropsWithChildren<ListProps>) => {
  const { orientation = 'vertical', children, ...boxProps } = props;
  const [group] = useState(() => new ListFocusGroup());
  const internalRef = useRef<DOMElement>(null);
  const ref = props.ref ?? internalRef;

  // @ts-expect-error - id is not a valid property of FocusGroup but it is useful for debugging
  group.id = props.id;

  useEffect(() => {
    const orientation = props.flexDirection === 'row' || props.flexDirection === 'row-reverse'
      ? 'horizontal'
      : 'vertical';

    group.orientation = orientation;
  }, [props.flexDirection, group]);

  useEffect(() => {
    if (!ref || typeof ref === 'function') return;
    if (ref.current == null) return;

    group.connectElement(ref.current);

    return () => {
      group.disconnect();
    };
  }, [group, ref]);

  return (
    <FocusGroupContext.Provider value={group}>
      <Box ref={ref} {...boxProps}>
        {children}
      </Box>
    </FocusGroupContext.Provider>
  );
}; 
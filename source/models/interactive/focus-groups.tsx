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
    const sorted = this.sortByLayoutOrder(focusable);

    // Add debug logging for focusable children
    if (sorted.length === 0) {
      log("no focusable children found", { groupId: this.id, childrenCount: this.children.length });
    }

    return sorted;
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

      log("focus event", {
        groupId: this.id,
        targetId: target.id,
        index,
        wasActive: this.#isActive
      });

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
        const activeElement = globalThis.windowNode.activeElement;
        const anyFocused = focusableChildren.some((n: FocusableNode) => n === activeElement);

        log("blur check", {
          groupId: this.id,
          activeElementId: activeElement?.id,
          anyFocused,
          focusableCount: focusableChildren.length,
          isActive: this.#isActive
        });

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

      const inputEvent = event as InputEvent;
      const { key } = inputEvent;

      if (key.tab) {
        // Prevent any further processing of this event
        event.stopImmediatePropagation();

        log('handling tab navigation', this.id, { shift: key.shift, propagationStopped: event.propagationStopped });

        if (key.shift) {
          this.navigateToPreviousGroup();
        } else {
          this.navigateToNextGroup();
        }
      }
    }, { signal: this.keyboardAbortController.signal });
  }

  private navigateToNextGroup(): void {
    // 1. First try to find child groups
    const childGroups = this.getChildFocusGroups();
    const firstChildGroup = childGroups.at(0);
    if (firstChildGroup?.focusableChildren.length) {
      log("navigating to first child group", this.id, firstChildGroup.id);
      this.#deactivate();
      firstChildGroup.focusableChildren.at(0)?.focus();
      return;
    }

    // 2. Then try sibling groups
    const siblingGroups = this.getSiblingFocusGroups();
    const currentIndex = siblingGroups.indexOf(this);
    if (currentIndex !== -1 && currentIndex < siblingGroups.length - 1) {
      const nextSibling = siblingGroups.at(currentIndex + 1);
      if (nextSibling?.focusableChildren.length) {
        log("navigating to next sibling group", this.id, nextSibling.id);
        this.#deactivate();
        nextSibling.focusableChildren.at(0)?.focus();
        return;
      }
    }

    // 3. At the end of siblings - go to parent and focus its next item
    const parent = this.getParentFocusGroup();
    if (parent) {
      log("going to parent and focusing next", this.id, parent.id);
      this.#deactivate();
      if (!parent.focusNext()) {
        // Parent couldn't focus next (at end) - deactivate parent too
        parent.#deactivate();
      }
      return;
    }

    // 4. No parent (root level) - try to cycle to first sibling
    if (currentIndex !== -1) {
      const firstSibling = siblingGroups.at(0);
      if (firstSibling && firstSibling !== this && firstSibling.focusableChildren.length) {
        log("cycling to first sibling", this.id, firstSibling.id);
        this.#deactivate();
        firstSibling.focusableChildren.at(0)?.focus();
        return;
      }
    }

    // 5. No valid navigation - deactivate
    log("no valid next navigation, deactivating", this.id);
    this.#deactivate();
  }

  private navigateToPreviousGroup(): void {
    // 1. Try previous sibling groups
    const siblingGroups = this.getSiblingFocusGroups();
    const currentIndex = siblingGroups.indexOf(this);

    if (currentIndex > 0) {
      const prevSibling = siblingGroups.at(currentIndex - 1);
      if (prevSibling?.focusableChildren.length) {
        // Find the deepest last child group of the previous sibling
        const deepestGroup = this.findDeepestLastChildGroup(prevSibling);
        log("navigating to previous sibling (deepest)", this.id, deepestGroup.id);
        this.#deactivate();
        deepestGroup.focusableChildren.at(0)?.focus();
        return;
      }
    }

    // 2. At the beginning of siblings - go to parent and focus current item
    const parent = this.getParentFocusGroup();
    if (parent) {
      log("going to parent and focusing current", this.id, parent.id);
      this.#deactivate();
      const currentNode = parent.currentNode;
      if (currentNode) {
        currentNode.focus();
      } else {
        parent.focusableChildren.at(0)?.focus();
      }
      return;
    }

    // 3. No parent (root level) - deactivate to let window handle
    log("no valid prev navigation, deactivating", this.id);
    this.#deactivate();
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

    // 3. At the end of siblings - go to parent and find its next
    const parent = this.getParentFocusGroup();
    if (parent) {
      return parent.findNextFocusGroup();
    }

    // 4. No parent (root level) - cycle back to first sibling
    if (currentIndex !== -1) {
      return siblingGroups.at(0) ?? null;
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

    // 2. At the beginning of siblings - go to parent
    const parent = this.getParentFocusGroup();
    if (parent) {
      return parent;
    }

    // 3. No parent (root level) - cycle to last sibling
    if (currentIndex === 0) {
      const lastSibling = siblingGroups.at(-1);
      if (lastSibling && lastSibling !== this) {
        return this.findDeepestLastChildGroup(lastSibling);
      }
    }

    return null;
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
      const rootGroups = this.findAllRootFocusGroups();
      // Ensure the current group is included in the siblings list
      if (!rootGroups.includes(this)) {
        rootGroups.push(this);
        return this.sortGroupsByPosition(rootGroups);
      }
      return rootGroups;
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
    const rootGroups = allGroups.filter(group => group.getParentFocusGroup() === null);

    // Sort root groups by position for consistent navigation order
    return this.sortGroupsByPosition(rootGroups);
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

      // If either position is unavailable, maintain stable order by using tree order
      if (!aPos && !bPos) return 0;
      if (!aPos) return 1; // Move groups without position to end
      if (!bPos) return -1;

      // Sort top to bottom first (reading order), then left to right
      const yDiff = aPos.top - bPos.top;

      if (yDiff !== 0) return yDiff;

      const xDiff = aPos.left - bPos.left;
      return xDiff;
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
        event.stopImmediatePropagation();
        return;
      }

      if (isPrev) {
        this.focusPrevious(); // Always cycles within the group
        event.stopImmediatePropagation();
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
  id?: string;
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
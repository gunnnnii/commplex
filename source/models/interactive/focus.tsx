import { FocusableNode } from "./interactive";
import { focus, type Node } from "./node";
import { getBoundingClientRect } from "../../utilities/layout-measurements";
import { log } from "../../utilities/logging/logger";

export class FocusManager {
  #rootNode: Node;

  constructor(rootNode: Node) {
    this.#rootNode = rootNode;
  }

  get currentNode(): FocusableNode | null {
    const activeElement = globalThis.windowNode.activeElement;
    return activeElement instanceof FocusableNode ? activeElement : null;
  }

  focusNext() {
    const focusableNodes = this.getFocusableNodes();
    if (focusableNodes.length === 0) return;

    const currentIndex = this.currentNode ? focusableNodes.indexOf(this.currentNode) : -1;
    const nextIndex = (currentIndex + 1) % focusableNodes.length;
    if (focusableNodes[nextIndex]) {
      focus(focusableNodes[nextIndex]);
    }
  }

  focusPrevious() {
    const focusableNodes = this.getFocusableNodes();
    if (focusableNodes.length === 0) return;

    const currentIndex = this.currentNode ? focusableNodes.indexOf(this.currentNode) : -1;
    const prevIndex = (currentIndex - 1 + focusableNodes.length) % focusableNodes.length;
    if (focusableNodes[prevIndex]) {
      focus(focusableNodes[prevIndex]);
    }
  }

  private getFocusableNodes(): FocusableNode[] {
    const nodes: FocusableNode[] = [];
    this.traverse(this.#rootNode, nodes);
    return this.sortByLayoutOrder(nodes);
  }

  private sortByLayoutOrder(nodes: FocusableNode[]): FocusableNode[] {
    return nodes.toSorted((a, b) => {
      const aElement = a.element;
      const bElement = b.element;

      if (!aElement || !bElement) return 0;

      const aRect = getBoundingClientRect(aElement);
      const bRect = getBoundingClientRect(bElement);

      if (!aRect || !bRect) return 0;

      // Sort top to bottom first, then left to right
      const xDiff = aRect.left - bRect.left;
      if (xDiff !== 0) {
        return xDiff;
      }

      return aRect.top - bRect.top;
    });
  }

  private traverse(node: Node, nodes: FocusableNode[]) {
    if (node instanceof FocusableNode) {
      nodes.push(node);
    }
    for (const child of node.children) {
      this.traverse(child, nodes);
    }
  }
}
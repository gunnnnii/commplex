import { FocusableNode } from "./interactive";
import type { Node } from "./node";

export class FocusManager {
  #currentNode: FocusableNode | null = null;
  #rootNode: Node;

  constructor(rootNode: Node) {
    this.#rootNode = rootNode;
  }

  get currentNode(): FocusableNode | null {
    return this.#currentNode;
  }

  focus() {
    if (this.#currentNode) return;

    const first = this.getFocusableNodes().at(0);
    if (first) {
      this.setFocus(first);
    }
  }

  blur() {
    if (this.#currentNode) {
      this.#currentNode.blur();
      this.#currentNode = null;
    }
  }

  focusNext() {
    const focusableNodes = this.getFocusableNodes();
    if (focusableNodes.length === 0) return;

    const currentIndex = this.#currentNode ? focusableNodes.indexOf(this.#currentNode) : -1;
    const nextIndex = (currentIndex + 1) % focusableNodes.length;
    if (focusableNodes[nextIndex]) {
      this.setFocus(focusableNodes[nextIndex]);
    }
  }

  focusPrevious() {
    const focusableNodes = this.getFocusableNodes();
    if (focusableNodes.length === 0) return;

    const currentIndex = this.#currentNode ? focusableNodes.indexOf(this.#currentNode) : -1;
    const prevIndex = (currentIndex - 1 + focusableNodes.length) % focusableNodes.length;
    if (focusableNodes[prevIndex]) {
      this.setFocus(focusableNodes[prevIndex]);
    }
  }

  private setFocus(node: FocusableNode) {
    if (this.#currentNode) {
      this.#currentNode.blur();
    }
    this.#currentNode = node;
    this.#currentNode.focus();
  }

  private getFocusableNodes(): FocusableNode[] {
    const nodes: FocusableNode[] = [];
    this.traverse(this.#rootNode, nodes);
    return nodes;
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
import type { DOMElement } from "ink";

export function measureLeft(node: DOMElement) {
  let left = node.yogaNode?.getComputedLeft() ?? 0;
  let parent = node?.parentNode;

  while (parent) {
    left += parent.yogaNode?.getComputedLeft() ?? 0;
    parent = parent.parentNode;
  }

  return left;
}

export function measureTop(node: DOMElement) {
  let top = node.yogaNode?.getComputedTop() ?? 0;
  let parent = node?.parentNode;

  while (parent) {
    top += parent.yogaNode?.getComputedTop() ?? 0;

    parent = parent.parentNode;
  }

  return top;
}

export function getBoundingClientRect(node: DOMElement) {
  let _left: number | undefined;
  let _top: number | undefined;
  let _width: number | undefined;
  let _height: number | undefined;

  return {
    get left() {
      if (_left === undefined) {
        _left = measureLeft(node);
      }
      return _left;
    },
    get top() {
      if (_top === undefined) {
        _top = measureTop(node);
      }
      return _top;
    },
    get width() {
      if (_width === undefined) {
        _width = node.yogaNode?.getComputedWidth() ?? 0;
      }
      return _width;
    },
    get height() {
      if (_height === undefined) {
        _height = node.yogaNode?.getComputedHeight() ?? 0;
      }
      return _height;
    },
    get right() {
      return this.left + this.width;
    },
    get bottom() {
      return this.top + this.height;
    },
    get x() {
      return this.left;
    },
    get y() {
      return this.top;
    }
  };
}

export function isPointInElement(element: DOMElement, x: number, y: number) {
  const rect = getBoundingClientRect(element);
  return x >= rect.left && rect.right > x && y >= rect.top && rect.bottom > y;
}
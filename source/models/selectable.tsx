import chalk from "chalk";
import { PixelTransform, type DOMElement } from "ink";
import { useState, useRef, useEffect, type ComponentPropsWithRef } from "react";
import { getBoundingClientRectForSelection } from "../utilities/layout-measurements";
import { useSelectionStore } from "./selection-store";
import { observer } from "mobx-react-lite";
import { Interactive } from "./interactive/interactive";

export const Selectable = observer((props: ComponentPropsWithRef<typeof Interactive> & {
  selectionId?: string;
}) => {
  const store = useSelectionStore();
  const internalRef = useRef<DOMElement>(null);
  const { selectionId: _, ...boxProps } = props;
  const ref = props.ref ?? internalRef;
  const [bbox, setBbox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const selectionId = props.selectionId ?? 'default';
  const rowRanges = store.getSelectionRows(selectionId);

  useEffect(() => {
    if (typeof ref === 'function' || typeof ref === 'string') return;
    if (ref.current == null) return;

    const rect = getBoundingClientRectForSelection(ref.current);
    const x = Math.floor(rect.left / 2) + 1;
    const y = Math.floor(rect.top / 2) + 1;
    const width = rect.width;
    const height = rect.height;

    setBbox({ x, y, width, height });
  }, [ref]);

  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const previousDragPointRef = useRef<{ x: number; y: number } | null>(null)

  return (
    <Interactive
      {...boxProps}
      ref={ref}
      id="selection"
      onClick={() => {
        store.clearSelection(selectionId)
      }}
      onMouseDown={(e) => {
        if (bbox == null) return;

        const x = e.x;
        const y = e.y;

        dragStartRef.current = { x, y };
        previousDragPointRef.current = { x, y };
        store.updateSelection(selectionId, [{ x, y }, { x, y }], bbox);
      }}
      onMouseUp={() => {
        dragStartRef.current = null;
        previousDragPointRef.current = null;
      }}
      onMouseMove={(event) => {
        const previousDragPoint = previousDragPointRef.current;
        const dragStart = dragStartRef.current;

        const isDragging = dragStart != null && previousDragPoint != null;

        if (isDragging && bbox) {
          const x = event.x;
          const y = event.y;

          const dx = x - previousDragPoint.x;
          const dy = y - previousDragPoint.y;

          if (Math.abs(dx) > Math.abs(dy)) {
            if (dx === 0 && dy === 0) return
          }

          previousDragPointRef.current = { x, y };
          // Continue drag - update end position with normalized range
          const start = dragStart;
          const end = { x, y };

          // Determine which position comes first in reading order (top-to-bottom, left-to-right)
          let rangeStart: { x: number; y: number };
          let rangeEnd: { x: number; y: number };

          if (end.y < start.y) {
            // End is on an earlier row - it comes first
            rangeStart = end;
            rangeEnd = start;
          } else if (end.y > start.y) {
            // End is on a later row - start comes first
            rangeStart = start;
            rangeEnd = end;
          } else {
            // Same row - whoever has smaller x comes first
            if (end.x < start.x) {
              rangeStart = end;
              rangeEnd = start;
            } else {
              rangeStart = start;
              rangeEnd = end;
            }
          }

          store.updateSelection(selectionId, [rangeStart, rangeEnd], bbox);
        }
      }}
    >
      {rowRanges.map((range, index) => (
        <PixelTransform
          key={`${range.start.x}-${range.start.y}-${range.end.x}-${index}`}
          range={[range.start, range.end]}
          transform={string => chalk.inverse(string)}
        />
      ))}
      {props.children}
    </Interactive>
  )
})
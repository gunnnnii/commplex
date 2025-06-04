import chalk from "chalk";
import { Box, PixelTransform, useStdin, type DOMElement } from "ink";
import { useState, useRef, useEffect, type ComponentPropsWithRef, useCallback } from "react";
import { getBoundingClientRect } from "../utilities/layout-measurements";
import { useSelectionStore } from "./selection-store";
import { observer } from "mobx-react-lite";

const enableMouseTracking = () => {
  process.stdout.write('\x1b[?1003h'); // all motion tracking
  process.stdout.write('\x1b[?1006h'); // SGR mode
};

const disableMouseTracking = () => {
  process.stdout.write('\x1b[?1003l');
  process.stdout.write('\x1b[?1006l');
};

function useDragRange(selectionId: string) {
  const selectionStore = useSelectionStore();
  const { stdin, setRawMode, isRawModeSupported } = useStdin();

  // Click detection thresholds
  const CLICK_DISTANCE_THRESHOLD = 1; // pixels

  const createClickPromise = useCallback(async (x: number, y: number) => {
    const resolvers = Promise.withResolvers<boolean>()

    const timeout = setTimeout(() => {
      resolvers.resolve(false);
    }, 200);


    const upHandler = (buffer: Buffer<ArrayBufferLike>) => {
      const chunk = buffer.toString()
      // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
      const match = /\x1b\[<(\d+);(\d+);(\d+)([mM])/.exec(chunk);

      if (!match) return;

      const [_, code, col, row, pressRelease] = match;

      if (!code || !col || !row || !pressRelease) return;

      const eventCode = Number.parseInt(code, 10);
      const upX = Number.parseInt(col, 10) - 1;
      const upY = Number.parseInt(row, 10);
      const distance = Math.sqrt(
        (x - upX) ** 2 +
        (y - upY) ** 2
      );

      if (eventCode === 0 && pressRelease === 'm' && distance <= CLICK_DISTANCE_THRESHOLD) {
        resolvers.resolve(true);
      } else {
        resolvers.resolve(false);
      }
    }

    stdin.on('data', upHandler)

    resolvers.promise.finally(() => {
      stdin.off('data', upHandler);
      clearTimeout(timeout);
    })

    return resolvers.promise;
  }, [stdin]);

  useEffect(() => {
    if (!isRawModeSupported) return;

    let afterClickBlocker = false;
    let dragStartRef: { x: number; y: number } | null = null
    let previousDragPoint: { x: number; y: number } | null = null

    setRawMode(true);
    enableMouseTracking();

    const clickHandler = (pressed: boolean, x: number, y: number) => {
      if (pressed) {
        // Create click promise
        createClickPromise(x, y)
          .then((success) => {
            if (success) {
              selectionStore.updateSelection(selectionId, null);
              dragStartRef = null;

              afterClickBlocker = true;
              setTimeout(() => {
                afterClickBlocker = false;
              }, 100);
            }
          })
      }
    };

    const dragHandler = (x: number, y: number) => {
      if (afterClickBlocker) return;

      if (previousDragPoint == null || dragStartRef == null) {
        selectionStore.updateSelection(selectionId, [{ x, y }, { x, y }]);
        previousDragPoint = { x, y };
        dragStartRef = { x, y };
      } else {
        const dx = x - previousDragPoint.x;
        const dy = y - previousDragPoint.y;

        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx === 0 && dy === 0) return
        }
      }

      previousDragPoint = { x, y };
      // Continue drag - update end position with normalized range
      const start = dragStartRef;
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

      selectionStore.updateSelection(selectionId, [rangeStart, rangeEnd]);
    };

    const handler = (buffer: Buffer<ArrayBufferLike>) => {
      const chunk = buffer.toString()

      // Parse mouse tracking events in SGR mode (\x1b[<code;col;row[mM])
      if (chunk.startsWith('\x1b[<')) {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: SGR mouse tracking format
        const match = /\x1b\[<(\d+);(\d+);(\d+)([mM])/.exec(chunk);
        if (match) {
          const [_, code, col, row, pressRelease] = match;

          if (!code || !col || !row || !pressRelease) return;

          const eventCode = Number.parseInt(code, 10);
          const x = Number.parseInt(col, 10) - 1;
          const y = Number.parseInt(row, 10);

          // Route to appropriate handler
          if (eventCode === 32) {
            // Drag/movement events
            dragHandler(x, y);
          } else {
            dragStartRef = null;

            if (eventCode === 0) {
              // Button press/release events
              clickHandler(pressRelease === 'M', x, y);
            }
          }
        }
      }
    }

    stdin.on('data', handler)

    return () => {
      setRawMode(false);
      disableMouseTracking();
      stdin.off('data', handler);
    }
  }, [isRawModeSupported, setRawMode, stdin, selectionStore, selectionId, createClickPromise]);

  return selectionStore.getSelection(selectionId);
}

type BBox = [{
  x: number;
  y: number;
}, {
  x: number;
  y: number;
}];

const clampToBounds = (bbox: BBox, x: number, y: number) => {
  return {
    x: Math.max(bbox[0].x, Math.min(bbox[1].x, x)),
    y: Math.max(bbox[0].y, Math.min(bbox[1].y, y))
  };
};

export const Selectable = observer((props: ComponentPropsWithRef<typeof Box> & {
  selectionId?: string;
}) => {
  const selectionId = props.selectionId ?? 'default';
  const range = useDragRange(selectionId);
  const internalRef = useRef<DOMElement>(null);
  const { selectionId: _, ...boxProps } = props;
  const ref = props.ref ?? internalRef;
  const [bbox, setBbox] = useState<BBox | null>(null);

  useEffect(() => {
    if (typeof ref === 'function' || typeof ref === 'string') return;
    if (ref.current == null) return;

    const bbox = getBoundingClientRect(ref.current);
    const x0 = Math.floor(bbox.left / 2)
    const y0 = Math.floor(bbox.top / 2)
    const x1 = Math.floor(bbox.left / 2) + bbox.width - 1
    const y1 = Math.floor(bbox.top / 2) + bbox.height

    setBbox([{ x: x0, y: y0 }, { x: x1, y: y1 }]);
  }, [ref]);

  // Split range into separate ranges for each row
  const createRowRanges = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    if (bbox == null) return [];

    const ranges: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];

    // Only create ranges for rows that intersect with the bbox
    const minY = Math.max(bbox[0].y, start.y);
    const maxY = Math.min(bbox[1].y, end.y);

    // If the selection doesn't intersect with the bbox at all, return empty
    if (minY > maxY) return ranges;

    if (minY === maxY) {
      // Single row selection
      const clampedStart = clampToBounds(bbox, start.x, minY);
      const clampedEnd = clampToBounds(bbox, end.x, maxY);

      // Only create range if there's actually something to select
      if (clampedStart.x <= clampedEnd.x) {
        ranges.push([clampedStart, clampedEnd]);
      }
    } else {
      // Multi-row selection
      for (let row = minY; row <= maxY; row++) {
        let rowStartX: number;
        let rowEndX: number;

        if (row === start.y) {
          // First row: start from selection start, go to end of content area
          rowStartX = Math.max(bbox[0].x, start.x);
          rowEndX = bbox[1].x;
        } else if (row === end.y) {
          // Last row: start from beginning of content area, go to selection end
          rowStartX = bbox[0].x;
          rowEndX = Math.min(bbox[1].x, end.x);
        } else {
          // Middle rows: full width of content area
          rowStartX = bbox[0].x;
          rowEndX = bbox[1].x;
        }

        // Only create range if there's actually something to select
        if (rowStartX <= rowEndX) {
          ranges.push([
            { x: rowStartX, y: row },
            { x: rowEndX, y: row }
          ]);
        }
      }
    }

    return ranges;
  };

  const rowRanges = bbox == null || range == null ? [] : createRowRanges(range[0], range[1]);

  return (
    <Box {...boxProps} ref={ref}>
      {rowRanges.map((rowRange, index) => (
        <PixelTransform
          key={`${rowRange[0].x}-${rowRange[0].y}-${rowRange[1].x}-${index}`}
          range={rowRange}
          transform={string => chalk.inverse(string)}
        />
      ))}
      {props.children}
    </Box>
  )
})
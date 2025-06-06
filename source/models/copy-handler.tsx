import { useApp } from 'ink';
import type { SelectionRange } from './selection-store';
import stripAnsi from 'strip-ansi';
import clipboard from 'clipboardy';
import { useCallback } from 'react';
import { zip } from 'remeda';

export function useCopy() {
  const { screenshot } = useApp();

  const copy = useCallback((selection: SelectionRange) => {
    const screen = stripAnsi(screenshot());

    const firstRow = selection.rows.at(0)?.start.y;

    if (firstRow == null) return;

    const lines = screen.split('\n').slice(firstRow);

    const selectedText = zip(lines, selection.rows).map(([line, row]) => {
      const start = row.start.x;
      const end = row.end.x;
      const text = line.slice(start, end + 1).trimEnd();
      return text;
    }).join('\n');

    clipboard.writeSync(selectedText);
  }, [screenshot]);

  return copy;
}


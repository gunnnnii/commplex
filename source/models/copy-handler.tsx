import { useApp } from 'ink';
import type { SelectionRange } from './selection-store';
import stripAnsi from 'strip-ansi';
import clipboard from 'clipboardy';
import { useCallback } from 'react';

export function useCopy() {
  const { screenshot } = useApp()

  const copy = useCallback((selection: SelectionRange) => {
    // screenshot gives the current screen as a string of characters
    const screen = stripAnsi(screenshot());

    // split the screen into lines
    const lines = screen.split('\n');

    // get the lines that are within the selection
    const selectedLines = lines.slice(selection.start.y, selection.end.y + 1);

    // get the characters that are within the selection
    const selectedCharacters = selectedLines.map(line => line.slice(selection.start.x, selection.end.x + 1));

    // join the characters into a string
    const selectedText = selectedCharacters.join('\n');
    clipboard.writeSync(selectedText);
  }, [screenshot])

  return copy;
}
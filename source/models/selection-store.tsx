import { observable, action, computed } from 'mobx';
import { createContext, useContext } from 'react';

export interface SelectionRow {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface SelectionRange {
  id: string;
  rows: SelectionRow[];
  bbox: { x: number; y: number; width: number; height: number };
}

export class SelectionStore {
  @observable accessor selections = new Map<string, SelectionRange>();
  @observable accessor activeSelectionId: string | null = null;

  @action
  setSelection(
    id: string,
    range: { start: { x: number; y: number }; end: { x: number; y: number } },
    bbox: { x: number; y: number; width: number; height: number },
  ) {
    // Convert the single range to multiple rows
    const rows = this.createRowsFromRange(range, bbox);
    this.selections.set(id, { id, rows, bbox });
    this.activeSelectionId = id;
  }

  @action
  updateSelection(
    id: string,
    range: [{ x: number; y: number }, { x: number; y: number }] | null,
    bbox: { x: number; y: number; width: number; height: number }
  ) {
    if (range === null) {
      return this.clearSelection(id);
    }

    return this.setSelection(id, { start: range[0], end: range[1] }, bbox);
  }

  private createRowsFromRange(
    range: { start: { x: number; y: number }; end: { x: number; y: number } },
    bbox: { x: number; y: number; width: number; height: number }
  ): SelectionRow[] {
    const rows: SelectionRow[] = [];

    // Only create ranges for rows that intersect with the bbox
    const minY = Math.max(bbox.y, range.start.y);
    const maxY = Math.min(bbox.y + bbox.height - 1, range.end.y);

    // If the selection doesn't intersect with the bbox at all, return empty
    if (minY > maxY) return rows;

    if (minY === maxY) {
      // Single row selection
      const clampedStartX = Math.max(bbox.x, Math.min(bbox.x + bbox.width - 1, range.start.x));
      const clampedEndX = Math.max(bbox.x, Math.min(bbox.x + bbox.width - 1, range.end.x));

      if (clampedStartX <= clampedEndX) {
        rows.push({
          start: { x: clampedStartX, y: minY },
          end: { x: clampedEndX, y: maxY }
        });
      }
    } else {
      // Multi-row selection
      for (let row = minY; row <= maxY; row++) {
        let rowStartX: number;
        let rowEndX: number;

        if (row === range.start.y) {
          // First row: start from selection start, go to end of content area
          rowStartX = Math.max(bbox.x, range.start.x);
          rowEndX = bbox.x + bbox.width - 1;
        } else if (row === range.end.y) {
          // Last row: start from beginning of content area, go to selection end
          rowStartX = bbox.x;
          rowEndX = Math.min(bbox.x + bbox.width - 1, range.end.x);
        } else {
          // Middle rows: full width of content area
          rowStartX = bbox.x;
          rowEndX = bbox.x + bbox.width - 1;
        }

        // Only create range if there's actually something to select
        if (rowStartX <= rowEndX) {
          rows.push({
            start: { x: rowStartX, y: row },
            end: { x: rowEndX, y: row }
          });
        }
      }
    }

    return rows;
  }

  @action
  clearSelection(id: string) {
    this.selections.delete(id);
    if (this.activeSelectionId === id) {
      this.activeSelectionId = this.selections.size > 0 ? Array.from(this.selections.keys())[0] ?? null : null;
    }
  }

  @action
  clearAllSelections() {
    this.selections.clear();
    this.activeSelectionId = null;
  }

  getSelection(id: string): SelectionRange | undefined {
    return this.selections.get(id);
  }

  getSelectionRange(id: string): SelectionRange | undefined {
    return this.selections.get(id);
  }

  /**
   * Get selection rows for visualization (absolute coordinates)
   */
  getSelectionRows(selectionId: string): SelectionRow[] {
    const selection = this.getSelection(selectionId);
    return selection ? selection.rows : [];
  }

  @computed
  get activeSelection(): SelectionRange | undefined {
    return this.activeSelectionId ? this.selections.get(this.activeSelectionId) : undefined;
  }

  @computed
  get allSelections(): SelectionRange[] {
    return Array.from(this.selections.values());
  }

  @computed
  get hasSelections(): boolean {
    return this.selections.size > 0;
  }
}

export const selectionStore = new SelectionStore();

export const SelectionStoreContext = createContext(selectionStore);

export const useSelectionStore = () => {
  return useContext(SelectionStoreContext);
}; 

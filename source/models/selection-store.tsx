import { makeAutoObservable } from 'mobx';
import { createContext, useContext } from 'react';

export interface SelectionRange {
  id: string; // For future multi-cursor support
  start: { x: number; y: number };
  end: { x: number; y: number };
  source?: string; // Which component/area created this selection
}

export class SelectionStore {
  selections = new Map<string, SelectionRange>();
  activeSelectionId: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  setSelection(id: string, range: { start: { x: number; y: number }; end: { x: number; y: number } }, source?: string) {
    this.selections.set(id, { id, start: range.start, end: range.end, source });
    this.activeSelectionId = id;
  }

  updateSelection(id: string, range: [{ x: number; y: number }, { x: number; y: number }] | null) {
    if (range === null) {
      this.clearSelection(id);
    } else {
      this.setSelection(id, { start: range[0], end: range[1] });
    }
  }

  clearSelection(id: string) {
    this.selections.delete(id);
    if (this.activeSelectionId === id) {
      this.activeSelectionId = this.selections.size > 0 ? Array.from(this.selections.keys())[0] ?? null : null;
    }
  }

  clearAllSelections() {
    this.selections.clear();
    this.activeSelectionId = null;
  }

  getSelection(id: string): [{ x: number; y: number }, { x: number; y: number }] | null {
    const selection = this.selections.get(id);
    return selection ? [selection.start, selection.end] : null;
  }

  getSelectionRange(id: string): SelectionRange | undefined {
    return this.selections.get(id);
  }

  get activeSelection(): SelectionRange | undefined {
    return this.activeSelectionId ? this.selections.get(this.activeSelectionId) : undefined;
  }

  get allSelections(): SelectionRange[] {
    return Array.from(this.selections.values());
  }

  get hasSelections(): boolean {
    return this.selections.size > 0;
  }
}

export const selectionStore = new SelectionStore();

export const SelectionStoreContext = createContext(selectionStore);

export const useSelectionStore = () => {
  return useContext(SelectionStoreContext);
}; 
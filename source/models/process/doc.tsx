import { computed, observable } from "mobx";
import type { Process } from "./process";
import { readFileSync } from "node:fs";
import type { ScrollableContentContainer } from "../scrollable/scrollable";
export class Doc implements ScrollableContentContainer {
  @observable accessor process: Process;
  @observable accessor #content: string;

  constructor(process: Process, content: string) {
    this.process = process;
    this.#content = content;
  }

  @computed
  get content() {
    try {
      const file = readFileSync(this.#content, "utf-8");
      return [{ id: 'docs', content: file }]
    } catch (_) {
      return [{ id: 'docs', content: `${this.#content}\n` }]
    }
  }
}
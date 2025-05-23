import { computed, observable } from "mobx";
import type { Process } from "./process";
import { readFileSync } from "node:fs";

export class Doc {
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
      return file
    } catch (_) {
      return this.#content;
    }
  }
}
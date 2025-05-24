import wrapAnsi from 'wrap-ansi';
import { action, computed, observable, reaction, runInAction, transaction, untracked } from 'mobx';

export interface Content { id: string; content: string };
export interface ContentContainer { content: Content[] };

function calculateMessageLines(message: Content, width: number) {
  const splitMessage = wrapAnsi(message.content, width);
  const lines = splitMessage.split('\n');
  lines.pop(); // an extra empty line is added for some reason 🤔

  return lines;
}

type Line =
  | { content: string; message: Content }
  | PADDING

class MessageView {
  @observable accessor #width = 0;
  @observable accessor #message: Content;

  constructor(message: Content) {
    this.#message = message;
  }

  @computed
  get lines() {
    if (this.#width === 0) return [];
    return calculateMessageLines(this.#message, this.#width);
  }

  @action
  setWidth(width: number) {
    this.#width = width;
  }

  get width() {
    return this.#width
  }

  @action
  setMessage(message: Content) {
    this.#message = message;
  }

  get message() {
    return this.#message
  }
}

export const PADDING = Symbol('padding');
export type PADDING = typeof PADDING;
export class Scrollable {
  @observable accessor process: ContentContainer;
  @observable accessor #width: number;
  @observable accessor #height: number;
  @observable accessor #offset: number;

  constructor(props: {
    container: ContentContainer;
    height?: number;
    offset?: number;
    width?: number;
  }) {
    this.process = props.container;
    this.#height = props.height ?? 0;
    this.#offset = props.offset ?? 0;
    this.#width = props.width ?? 0;
  }

  @observable accessor #messageViewCache = new Map<Content, MessageView>();

  #getMessageView(message: Content) {
    let view: MessageView | undefined = undefined;

    untracked(() => {
      view = this.#messageViewCache.get(message);
    });

    if (view == null) {
      view = new MessageView(message);
      runInAction(() => {
        // biome-ignore lint/style/noNonNullAssertion: this runs synchronously, so we can safely assume that the message is valid
        this.#messageViewCache.set(message, view!);
      });
    }

    runInAction(() => {
      view?.setWidth(this.width);
    });

    return view;
  }

  #getMessageListLengthUntracked() {
    let length = 0;

    untracked(() => {
      length = this.process.content.length;
    });

    return length;
  }

  #getFirstVisibleMessage(): {
    index: number;
    relativeLineIndex: number;
    absoluteLineIndex: number;
  } {
    /*
    do not access this.process.messages.length in here, as this will cause the index to be invalidated when additional messages are added
    even though the 
    */
    if (0 >= this.#offset) {
      return {
        index: 0,
        relativeLineIndex: this.#offset,
        absoluteLineIndex: this.#offset,
      };
    }

    let total = 0;
    const totalMessages = this.#getMessageListLengthUntracked();

    let lastMessageLength = 0;

    for (let index = 0; index < totalMessages; index++) {
      // biome-ignore lint/style/noNonNullAssertion: we are sure that the index is valid
      const message = this.process.content.at(index)!;

      const prevTotal = total;
      const lines = calculateMessageLines(message, this.width).length;
      total += lines;

      lastMessageLength = lines;

      if (total >= this.#offset) {
        const diff = Math.abs(this.#offset - total);
        const firstVisisbleLineIndex = lines - diff;
        const absoluteLineIndex = prevTotal + firstVisisbleLineIndex;
        return {
          index,
          relativeLineIndex: firstVisisbleLineIndex,
          absoluteLineIndex,
        };
      }
    }

    const lastMessageOvershotIndex = lastMessageLength + this.#offset - total;
    return {
      index: totalMessages - 1,
      relativeLineIndex: lastMessageOvershotIndex,
      absoluteLineIndex: total,
    };
  }

  @computed
  get firstVisibleMessage(): {
    index: number;
    relativeLineIndex: number;
    absoluteLineIndex: number;
  } {
    return this.#getFirstVisibleMessage();
  }

  @computed
  get hasNextLines() {
    void this.process.content.length;
    return this.#lines.lines.at(-1) !== PADDING;
  }

  @computed
  get hasPreviousLines() {
    return this.#lines.lines.at(0) !== PADDING;
  }

  @computed
  get length() {
    void this.#width;
    let sum = 0;
    for (const message of this.process.content) {
      const view = this.#getMessageView(message);
      sum += view.lines.length;
    }

    return sum;
  }

  *iterateLines(start = 0) {
    let padding = start * -1;
    while (padding-- > 0) {
      yield PADDING;
    }

    const totalMessages = this.#getMessageListLengthUntracked();
    const firstMessageIndex = this.firstVisibleMessage.index;

    let linesToSkip = this.firstVisibleMessage.relativeLineIndex;

    for (
      let index = firstMessageIndex;
      index >= 0 && index < totalMessages;
      index++
    ) {
      // biome-ignore lint/style/noNonNullAssertion: we are sure that the index is valid
      const message = this.process.content.at(index)!;
      const view = this.#getMessageView(message);
      const lines = view.lines;

      for (const line of lines) {
        if (--linesToSkip > 0) continue;
        yield { content: line, message };
      }
    }

    // here we have reached the end of the log,
    // so access the messages length to trigger updates if new messages are added
    void this.process.content.length;

    while (true) {
      yield PADDING;
    }
  }

  @computed
  get #lines(): { lines: (Line | PADDING)[] } {
    const prebuffer = 1;
    const postbuffer = 1;
    // access an extra line on either end to check if there are more lines
    const lines: (Line | PADDING)[] = take(this.iterateLines(
      this.#offset - prebuffer
    ), prebuffer + this.#height + postbuffer);

    return { lines };
  }

  @computed
  get lines(): { messages: (Content | PADDING)[] } {
    // cut off excess lines at either end, which are used to check if there are more lines
    const lines = this.#lines.lines.slice(1, -1);

    const messages: (Content | PADDING)[] = [];

    for (const line of lines) {
      if (line === PADDING) {
        messages.push(line);
      } else {
        const lastMessage = messages.at(-1);

        if (
          lastMessage != null &&
          lastMessage !== PADDING &&
          line.message.id === lastMessage?.id
        ) {
          lastMessage.content += '\n';
          lastMessage.content += line.content;
        } else {
          messages.push({ ...line.message, content: line.content });
        }
      }
    }

    return { messages };
  }

  @action
  setWidth(width: number) {
    for (const messageView of this.#messageViewCache.values()) {
      messageView.setWidth(width);
    }

    this.#width = width;
  }

  get width() {
    return this.#width;
  }

  @action
  setHeight(height: number) {
    transaction(() => {
      const diff = this.#height - height;

      this.#height = height;
      this.#offset += diff;
    });
  }

  get height() {
    return this.#height;
  }

  get offset() {
    return this.#offset;
  }

  @action
  setDimensions({ width, height }: { width: number; height: number }) {
    transaction(() => {
      this.#width = width;
      this.#height = height;
    });
  }

  @action
  setOffset(offset: number) {
    this.#offset = offset;
  }

  #trackerController = new AbortController();

  @action
  scroll(lines: number) {
    if (lines === 0) return;

    this.#trackerController.abort();
    this.#trackerController = new AbortController();
    this.#offset += lines;
  }

  @action
  scrollToTop() {
    this.#offset = 0;
  }

  @action
  scrollToBottom() {
    this.#offset = this.length - this.#height;
  }

  track(onScroll?: (offset: number) => void) {
    return reaction(
      () => [
        this.offset,
        this.width,
        this.height,
        this.hasNextLines,
        this.hasPreviousLines,
      ],
      () => {
        runInAction(() => this.scrollToBottom());
        onScroll?.(this.offset);
      },
      { signal: this.#trackerController.signal, fireImmediately: true }
    );
  }
}

function take<T>(iterator: Iterator<T>, n: number): T[] {
  const result: T[] = [];
  let count = 0;
  while (count < n) {
    const next = iterator.next();
    if (next.done) {
      break;
    }
    result.push(next.value);
    count++;
  }
  return result;
}

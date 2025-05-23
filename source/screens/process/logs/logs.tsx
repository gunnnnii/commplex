import { useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Box, measureElement, Text, useStdin, useStdout, type DOMElement, } from 'ink';
import type { Message } from '../../../models/process/message.js';
import wrapAnsi from 'wrap-ansi';
import { observer } from 'mobx-react-lite';
import { action, computed, observable, reaction, runInAction, transaction, untracked } from 'mobx';
import type { Process } from '../../../models/process/process.js';
import { match } from 'ts-pattern';
import { log } from '../../../utilities/logging/logger.js';

const enableMouseTracking = () => {
  process.stdout.write('\x1b[?1003h'); // all motion tracking
  process.stdout.write('\x1b[?1006h'); // SGR mode
};

const disableMouseTracking = () => {
  process.stdout.write('\x1b[?1003l');
  process.stdout.write('\x1b[?1006l');
};

function calculateMessageLines(message: Message, width: number) {
  const splitMessage = wrapAnsi(message.content, width, { hard: true });
  const lines = splitMessage.split('\n');
  lines.pop(); // an extra empty line is added for some reason 🤔

  return lines;
}

type Line =
  | { content: string; message: Message }
  | PADDING

class MessageView {
  @observable accessor #width = 0;
  @observable accessor #message: Message;

  constructor(message: Message) {
    this.#message = message;
  }

  @computed
  get lines() {
    if (this.#width === 0) return [];
    return calculateMessageLines(this.#message, this.#width);
  }

  getMessage(start = 0, end = this.lines.length) {
    const lines = this.lines.slice(start, end);
    const message = { ...this.#message, content: lines.join('\n') };
    return message;
  }

  @action
  setWidth(width: number) {
    this.#width = width;
  }

  get width() {
    return this.#width
  }

  @action
  setMessage(message: Message) {
    this.#message = message;
  }

  get message() {
    return this.#message
  }
}

const PADDING = Symbol('padding');
type PADDING = typeof PADDING;

class LogView {
  @observable accessor process: Process;
  @observable accessor #width: number;
  @observable accessor #height: number;
  @observable accessor #offset: number;

  constructor(props: {
    process: Process,
    height?: number,
    offset?: number,
    width?: number,
  }) {
    this.process = props.process;
    this.#height = props.height ?? 0;
    this.#offset = props.offset ?? 0;
    this.#width = props.width ?? 0;
  }

  @observable accessor #messageViewCache = new Map<Message, MessageView>();

  #getMessageView(message: Message) {
    let view: MessageView | undefined = undefined;

    untracked(() => {
      view = this.#messageViewCache.get(message);
    })

    if (view == null) {
      view = new MessageView(message);
      runInAction(() => {
        // biome-ignore lint/style/noNonNullAssertion: this runs synchronously, so we can safely assume that the message is valid
        this.#messageViewCache.set(message, view!);
      })
    }

    runInAction(() => {
      view?.setWidth(this.width);
    })

    return view;
  }

  #getMessageListLengthUntracked() {
    let length = 0;

    untracked(() => {
      length = this.process.messages.length;
    })

    logProcess(this.process, `message length: ${length}`)

    return length;
  }

  #getFirstVisisbleMessageFromZero(): { index: number, relativeLineIndex: number, absoluteLineIndex: number } {
    /*
    do not access this.process.messages.length in here, as this will cause the index to be invalidated when additional messages are added
    even though the 
    */
    if (0 >= this.#start) {
      return { index: 0, relativeLineIndex: this.#start, absoluteLineIndex: this.#start };
    }

    let total = 0;
    const totalMessages = this.#getMessageListLengthUntracked();

    let lastMessageLength = 0;
    for (let index = 0; index < totalMessages; index++) {
      // biome-ignore lint/style/noNonNullAssertion: we are sure that the index is valid
      const message = this.process.messages.at(index)!;

      const prevTotal = total;
      const lines = calculateMessageLines(message, this.width).length;
      total += lines;

      lastMessageLength = lines;

      if (total >= this.#start) {
        const diff = Math.abs(this.#start - total);
        const firstVisisbleLineIndex = lines - diff;
        const absoluteLineIndex = prevTotal + firstVisisbleLineIndex;
        return { index, relativeLineIndex: firstVisisbleLineIndex, absoluteLineIndex };
      }
    }

    const lastMessageOvershotIndex = lastMessageLength + this.#start - total;
    return { index: totalMessages - 1, relativeLineIndex: lastMessageOvershotIndex, absoluteLineIndex: total };
  }

  @computed
  get direction() {
    return this.#height >= 0 ? 'forwards' : 'backwards';
  }

  @computed
  get firstVisibleMessage(): { index: number, relativeLineIndex: number, absoluteLineIndex: number } {
    return this.#getFirstVisisbleMessageFromZero();
  }

  @computed
  get hasNextLines() {
    void this.process.messages.length;
    return this.#lines.lines.at(-1) !== PADDING;
  }

  @computed
  get hasPreviousLines() {
    return this.#lines.lines.at(0) !== PADDING;
  }

  @computed
  get length() {
    let sum = 0;
    for (const message of this.process.messages) {
      const view = this.#getMessageView(message);
      sum += view.lines.length
    }

    logProcess(this.process, `message length: ${sum}`)

    return sum;
  }

  *iterateLinesForwards(start = 0) {
    let padding = start * -1;

    while (padding-- > 0) {
      yield PADDING;
    }

    const totalMessages = this.#getMessageListLengthUntracked();
    const firstMessageIndex = this.firstVisibleMessage.index;

    let linesToSkip = this.firstVisibleMessage.relativeLineIndex;
    for (let index = firstMessageIndex; index < totalMessages; index++) {
      // biome-ignore lint/style/noNonNullAssertion: we are sure that the index is valid
      const message = this.process.messages.at(index)!;
      const view = this.#getMessageView(message);
      const lines = view.lines;

      for (const line of lines) {
        if (linesToSkip-- > 0) continue;
        yield { content: line, message };
      }
    }

    // here we have reached the end of the log,
    // so access the messages length to trigger updates if new messages are added
    void this.process.messages.length;

    while (true) {
      yield PADDING;
    }
  }

  *iterateLinesBackwards(start = 0) {
    let padding = start - this.firstVisibleMessage.absoluteLineIndex;

    if (padding >= 0) {
      // if padding is positive, we are at the end of the log,
      // so access the messages length to trigger updates if new messages are added
      void this.process.messages.length;
    }

    while (padding-- > 0) {
      yield PADDING;
    }

    const firstMessageIndex = this.firstVisibleMessage.index;

    let linesToSkip = -1;
    for (let index = firstMessageIndex; index >= 0; index--) {
      // biome-ignore lint/style/noNonNullAssertion: we are sure that the index is valid
      const message = this.process.messages.at(index)!;
      const view = this.#getMessageView(message);
      const lines = view.lines.toReversed();

      if (index === firstMessageIndex) {
        linesToSkip = lines.length - this.firstVisibleMessage.relativeLineIndex;
      }

      for (const line of lines) {
        if (0 >= linesToSkip--) {
          yield { content: line, message };
        }
      }
    }

    while (true) {
      yield PADDING;
    }
  }

  @computed
  get #lines(): { lines: (Line | PADDING)[] } {
    const start = this.#start;
    const total = Math.abs(this.#end - start);

    if (this.direction === 'backwards') {
      // access an extra line on either end to check if there are more lines
      const lines: (Line | PADDING)[] = take(this.iterateLinesBackwards(start + 1), total + 1)
      return { lines: lines };
    }

    // access an extra line on either end to check if there are more lines
    const lines: (Line | PADDING)[] = take(this.iterateLinesForwards(start - 1), total + 1)
    return { lines: lines };
  }

  @computed
  get lines(): { messages: (Message | PADDING)[] } {
    // cut off excess lines at either end, which are used to check if there are more lines
    const lines = this.#lines.lines.slice(1, -1);

    const messages: (Message | PADDING)[] = [];

    logProcess(this.process, `${this.#width} ${this.#height} ${this.#offset} ${this.#getMessageListLengthUntracked()} ${this.length}`);
    for (const line of lines) {
      if (line === PADDING) {
        messages.push(line);
      } else {
        const lastMessage = messages.at(-1);

        if (lastMessage != null && lastMessage !== PADDING && line.message.id === lastMessage?.id) {
          lastMessage.content += '\n'
          lastMessage.content += line.content;
        } else {
          messages.push({ ...line.message, content: line.content });
        }
      };
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
    return this.#width
  }

  @action
  setHeight(height: number) {
    transaction(() => {
      const diff = this.#height - height;

      this.#height = height;
      this.#offset += diff;
    })
  }

  get height() {
    return this.#height
  }

  get offset() {
    return this.#offset
  }

  @action
  setDimensions({ width, height }: { width: number, height: number }) {
    transaction(() => {
      this.#width = width;
      this.#height = height;
    })
  }

  get #start() {
    if (0 > this.#height) {
      return this.#height + this.#offset;
    }

    return this.#offset;
  }

  get #end() {
    if (0 > this.#height) {
      return this.#offset;
    }
    return this.#height + this.#offset;
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
  scrollToEnd() {
    transaction(() => {
      if (this.lines.messages.length === 0) return;

      if (this.direction === 'forwards') {
        while (this.hasNextLines) {
          this.#offset++;
        }

        // while (this.lines.messages.at(-1) === PADDING) {
        //   this.#offset++;
        // }
      }

      if (this.direction === 'backwards') {
        while (this.hasPreviousLines) {
          this.#offset--;
        }
      }
    })
  }

  @action
  scrollToTop() {
    if (this.direction === 'backwards') {
      const totalMessages = this.#getMessageListLengthUntracked();
      let totalLines = 0;

      for (let index = 0; index < totalMessages; index++) {
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        const message = this.process.messages.at(index)!;
        const lines = calculateMessageLines(message, this.width).length;
        totalLines += lines;
      }

      this.#offset = -Math.max(0, totalLines - Math.abs(this.#height));
    } else {
      this.#offset = 0;
    }
  }

  @action
  scrollToBottom() {
    if (this.direction === 'backwards') {
      this.#offset = 0;
    } else {
      const totalMessages = this.#getMessageListLengthUntracked();
      let totalLines = 0;

      for (let index = 0; index < totalMessages; index++) {
        // biome-ignore lint/style/noNonNullAssertion: <explanation>
        const message = this.process.messages.at(index)!;
        const lines = calculateMessageLines(message, this.width).length;
        totalLines += lines;
      }

      this.#offset = Math.max(0, totalLines - this.#height);
    }
  }

  track() {
    return reaction(() => [this.direction, this.offset, this.width, this.height, this.hasNextLines, this.hasPreviousLines], () => {
      runInAction(() => this.scrollToBottom());
    }, { signal: this.#trackerController.signal, fireImmediately: true })
  }
}

export const Logs = observer((props: PropsWithChildren<{ process: Process }>) => {
  const [view] = useState(() => new LogView({ process: props.process }));
  const ref = useRef<DOMElement>(null);

  const { stdout } = useStdout();
  const { stdin, setRawMode, isRawModeSupported } = useStdin();

  useLayoutEffect(() => {
    if (ref.current) {
      const measurement = measureElement(ref.current)
      view.setDimensions(measurement);
      view.scrollToBottom()
    }

    const handler = () => {
      if (ref.current) {
        const measurement = measureElement(ref.current)
        view.setDimensions(measurement);
      }
    }

    stdout.on('resize', handler)

    return () => { stdout.off('resize', handler) }
  }, [stdout, view]);

  useEffect(() => {
    if (!isRawModeSupported) return;

    setRawMode(true);
    enableMouseTracking();

    const handler = (buffer: Buffer<ArrayBufferLike>) => {
      const chunk = buffer.toString()

      if (chunk.startsWith('\x1b[<')) {
        // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
        const match = /\x1b\[<(\d+);(\d+);(\d+)([mM])/.exec(chunk);
        if (match) {
          const [_, code, col, row] = match;

          if (!code || !col || !row) return;

          const eventCode = Number.parseInt(code, 10);

          if (eventCode === 64 && view.hasPreviousLines) { // up
            view.scroll(-1);
          } else if (eventCode === 65 && view.hasNextLines) { // down
            view.scroll(1);
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
  }, [isRawModeSupported, setRawMode, stdin, view]);

  useEffect(() => {
    // any time we reach the end of the log, we start tracking the addition of new lines
    if (!view.hasNextLines) {
      const dispose = view.track();
      return () => dispose();
    }
  }, [view, view.hasNextLines])

  return (
    <Box
      flexDirection="row"
      flexGrow={1}
    >
      <Box
        ref={ref}
        flexDirection='column'
        flexGrow={1}
        justifyContent='flex-end'
      >
        {/* <Text>{props.process.name} {view.length} {props.process.messages.length} {view.offset}</Text> */}
        <LogViewPrint view={view} />
      </Box>
      <Scrollbar view={view} />
    </Box>
  )
})

const Scrollbar = observer((props: { view: LogView }) => {
  const height = Math.max(props.view.height, 1);

  const maxOffset = Math.max(0, props.view.length - height - 1);
  const offset = clamp(props.view.offset, 0, maxOffset);

  const location = Math.floor((offset / maxOffset) * (height - 1));

  const blocks = Array.from({ length: height }, (_, index) => (
    index === location ? (
      // biome-ignore lint/correctness/useJsxKeyInIterable: order of these doesn't matter
      <Text>░</Text>
    ) : (
      // biome-ignore lint/correctness/useJsxKeyInIterable: order of these doesn't matter
      <Text>█</Text>
    )
  ))
  return (
    <Box
      flexDirection='column'
      gap={0}
    >
      {blocks}
    </Box>
  )
})

const LogViewPrint = observer((props: { view: LogView }) => {
  const lines = props.view.lines.messages.map((message) => {
    return match(message)
      .with(PADDING, () => null)
      .otherwise((message) => <Text key={message.id} wrap='wrap'>{message.content}</Text>)
  })

  useEffect(() => {
    logProcess(props.view.process, `rendering lines: ${lines.filter(Boolean).length}`)
  }, [lines, props.view])

  return lines;
})

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function logProcess(process: Process, ...messages: string[]) {
  if (process.name === "watch_logs") return;

  log(`[${process.name}] ${messages.join(' ')}`);
}
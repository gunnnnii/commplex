import { useEffect, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Box, measureElement, Text, useStdin, useStdout, type DOMElement, } from 'ink';
import type { Message } from '../../../models/process/message.js';
import wrapAnsi from 'wrap-ansi';
import { observer } from 'mobx-react-lite';
import { action, computed, observable, reaction, runInAction, transaction, untracked } from 'mobx';
import type { Process } from '../../../models/process/process.js';
import { match } from 'ts-pattern';

const enableMouseTracking = () => {
  process.stdout.write('\x1b[?1003h'); // all motion tracking
  process.stdout.write('\x1b[?1006h'); // SGR mode
};

const disableMouseTracking = () => {
  process.stdout.write('\x1b[?1003l');
  process.stdout.write('\x1b[?1006l');
};

function calculateMessageLines(message: Message, width: number) {
  const splitMessage = wrapAnsi(message.content, width);
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
    process: Process;
    height?: number;
    offset?: number;
    width?: number;
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
      length = this.process.messages.length;
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
      const message = this.process.messages.at(index)!;

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
  get direction() {
    return this.#height >= 0 ? 'forwards' : 'backwards';
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
    void this.process.messages.length;
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
    for (const message of this.process.messages) {
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
      const message = this.process.messages.at(index)!;
      const view = this.#getMessageView(message);
      const lines = view.lines;

      for (const line of lines) {
        if (--linesToSkip > 0) continue;
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
  get lines(): { messages: (Message | PADDING)[] } {
    // cut off excess lines at either end, which are used to check if there are more lines
    const lines = this.#lines.lines.slice(1, -1);

    const messages: (Message | PADDING)[] = [];

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
        this.direction,
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

  // i have no idea why, but some messages styles manage to leak out of their line and spread into the rest of the UI
  // other things i have tried
  // - adding a \x1B[0m	reset at the end of every line
  // - adding a text element containing a reset at the end of every line
  // - applying this hack to the lines themselves
  // - various other things
  // and this is the only way i've found that works
  const hackToPreventBoldFromLeaking = true;

  const blocks = Array.from({ length: height }, (_, index) => (
    index === location ? (
      // biome-ignore lint/correctness/useJsxKeyInIterable: order of these doesn't matter
      <Text bold={hackToPreventBoldFromLeaking}>░</Text>
    ) : (
      // biome-ignore lint/correctness/useJsxKeyInIterable: order of these doesn't matter
      <Text bold={hackToPreventBoldFromLeaking}>█</Text>
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

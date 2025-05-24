import { useEffect, useLayoutEffect, useMemo, useRef, type PropsWithChildren } from 'react';
import { Box, measureElement, Text, useStdin, useStdout, type DOMElement, } from 'ink';
import { observer } from 'mobx-react-lite';
import { match } from 'ts-pattern';
import { PADDING, Scrollable } from './scrollable.js';
import type { ScrollableContentContainer } from './scrollable.js';

const enableMouseTracking = () => {
  process.stdout.write('\x1b[?1003h'); // all motion tracking
  process.stdout.write('\x1b[?1006h'); // SGR mode
};

const disableMouseTracking = () => {
  process.stdout.write('\x1b[?1003l');
  process.stdout.write('\x1b[?1006l');
};

export const ScrollView = observer((props: PropsWithChildren<{ content: ScrollableContentContainer, justifyContent?: 'flex-end' | 'flex-start' }>) => {
  const view = useMemo(() => {
    return new Scrollable({ container: props.content });
  }, [props.content]);
  const ref = useRef<DOMElement>(null);

  const { stdout } = useStdout();
  const { stdin, setRawMode, isRawModeSupported } = useStdin();

  useLayoutEffect(() => {
    if (ref.current) {
      const measurement = measureElement(ref.current)
      view.setDimensions(measurement);
      if (props.justifyContent === 'flex-end') view.scrollToBottom()
    }

    const handler = () => {
      if (ref.current) {
        const measurement = measureElement(ref.current)
        view.setDimensions(measurement);
      }
    }

    stdout.on('resize', handler)

    return () => { stdout.off('resize', handler) }
  }, [stdout, view, props.justifyContent]);

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
        justifyContent={props.justifyContent}
      >
        <ContentPrint view={view} />
      </Box>
      <Scrollbar view={view} />
    </Box>
  )
})

const Scrollbar = observer((props: { view: Scrollable }) => {
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

const ContentPrint = observer((props: { view: Scrollable }) => {
  const lines = props.view.lines.messages.map((message) => {
    return match(message)
      .with(PADDING, () => null)
      .otherwise((message) => <Text key={message.id} wrap='wrap'>{message.content}</Text>)
  })

  return lines;
})

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

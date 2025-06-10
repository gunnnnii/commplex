import test from 'ava';
import * as React from 'react';
import { render } from 'ink-testing-library';
import { Box, Text, useFocus } from 'ink';
import { FocusGroupComponent, List } from '../../../source/models/interactive/focus-groups';
import { Focusable } from '../../../source/models/interactive/interactive';

const { useEffect } = React;

// Track which element has focus
let focusedElements: Set<string> = new Set();
let lastFocusedId: string | null = null;

// Helper component for testing focus
const TestFocusable = ({ children, id, onFocus }: { 
  children: React.ReactNode; 
  id?: string;
  onFocus?: (id: string) => void;
}) => {
  const { isFocused } = useFocus({ id });
  
  useEffect(() => {
    if (isFocused && id) {
      focusedElements.add(id);
      lastFocusedId = id;
      onFocus?.(id);
    }
  }, [isFocused, id, onFocus]);

  return (
    <Focusable id={id}>
      <Text>{children}{isFocused ? ' [FOCUSED]' : ''}</Text>
    </Focusable>
  );
};

// Helper to reset focus tracking
const resetFocusTracking = () => {
  focusedElements = new Set();
  lastFocusedId = null;
};

// Helper to simulate key presses
const simulateTab = (stdin: { write: (data: string) => void }) => {
  stdin.write('\t');
};

const simulateShiftTab = (stdin: { write: (data: string) => void }) => {
  stdin.write('\u001B[Z'); // ESC[Z is the sequence for Shift+Tab
};

// Test scenarios for Tab (forward) navigation
test.beforeEach(() => {
  resetFocusTracking();
});

test('Tab navigation: no active element focuses top-left-most focusable element', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
      <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
      <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
    </Box>
  );

  // Wait for initial render
  await global.sleep(50);
  
  // Simulate Tab key press
  simulateTab(stdin);
  await global.sleep(50);

  // Verify first element is focused
  t.is(lastFocusedId, 'item1');
  t.deepEqual(focusOrder, ['item1']);
});

test('Tab navigation: focus group with child group focuses child', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <FocusGroupComponent>
      <TestFocusable id="parent1" onFocus={id => focusOrder.push(id)}>Parent 1</TestFocusable>
      <FocusGroupComponent>
        <TestFocusable id="child1" onFocus={id => focusOrder.push(id)}>Child 1</TestFocusable>
        <TestFocusable id="child2" onFocus={id => focusOrder.push(id)}>Child 2</TestFocusable>
      </FocusGroupComponent>
    </FocusGroupComponent>
  );

  await global.sleep(50);
  
  // First tab should focus parent1
  simulateTab(stdin);
  await global.sleep(50);
  
  // Second tab should focus child group (child1)
  simulateTab(stdin);
  await global.sleep(50);

  t.is(lastFocusedId, 'child1');
  t.deepEqual(focusOrder, ['parent1', 'child1']);
});

test('Tab navigation: focus group with next sibling focuses sibling', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <FocusGroupComponent>
        <TestFocusable id="group1-item1" onFocus={id => focusOrder.push(id)}>Group 1 Item 1</TestFocusable>
        <TestFocusable id="group1-item2" onFocus={id => focusOrder.push(id)}>Group 1 Item 2</TestFocusable>
      </FocusGroupComponent>
      <FocusGroupComponent>
        <TestFocusable id="group2-item1" onFocus={id => focusOrder.push(id)}>Group 2 Item 1</TestFocusable>
        <TestFocusable id="group2-item2" onFocus={id => focusOrder.push(id)}>Group 2 Item 2</TestFocusable>
      </FocusGroupComponent>
    </Box>
  );

  await global.sleep(50);
  
  // Focus first group
  simulateTab(stdin);
  await global.sleep(50);
  
  // Tab to next sibling group
  simulateTab(stdin);
  await global.sleep(50);

  t.is(lastFocusedId, 'group2-item1');
  t.deepEqual(focusOrder, ['group1-item1', 'group2-item1']);
});

test('Tab navigation: parent group with next sibling focuses parent', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <FocusGroupComponent>
        <TestFocusable id="group1-item1" onFocus={id => focusOrder.push(id)}>Group 1 Item 1</TestFocusable>
        <FocusGroupComponent>
          <TestFocusable id="nested-item1" onFocus={id => focusOrder.push(id)}>Nested Item 1</TestFocusable>
        </FocusGroupComponent>
      </FocusGroupComponent>
      <FocusGroupComponent>
        <TestFocusable id="group2-item1" onFocus={id => focusOrder.push(id)}>Group 2 Item 1</TestFocusable>
      </FocusGroupComponent>
    </Box>
  );

  await global.sleep(50);
  
  // Focus first group
  simulateTab(stdin);
  await global.sleep(50);
  
  // Focus nested group
  simulateTab(stdin);
  await global.sleep(50);
  
  // Tab should go to parent's next sibling
  simulateTab(stdin);
  await global.sleep(50);

  t.is(lastFocusedId, 'group2-item1');
  t.deepEqual(focusOrder, ['group1-item1', 'nested-item1', 'group2-item1']);
});

test('Tab navigation: cycles to top-left-most when at end', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <FocusGroupComponent>
        <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
        <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
      </FocusGroupComponent>
    </Box>
  );

  await global.sleep(50);
  
  // Focus first item
  simulateTab(stdin);
  await global.sleep(50);
  
  // Focus second item
  simulateTab(stdin);
  await global.sleep(50);
  
  // Tab should cycle back to first item
  simulateTab(stdin);
  await global.sleep(50);

  t.is(lastFocusedId, 'item1');
  // Item1 appears twice in the order
  t.true(focusOrder.filter(id => id === 'item1').length === 2);
});

// Test scenarios for Shift+Tab (backward) navigation
test('Shift+Tab navigation: no active element focuses bottom-right-most element', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
      <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
      <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
    </Box>
  );

  await global.sleep(50);
  
  // Simulate Shift+Tab key press
  simulateShiftTab(stdin);
  await global.sleep(50);

  // Should focus the last element
  t.is(lastFocusedId, 'item3');
  t.deepEqual(focusOrder, ['item3']);
});

test('Shift+Tab navigation: focus group with previous sibling focuses sibling', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <FocusGroupComponent>
        <TestFocusable id="group1-item1" onFocus={id => focusOrder.push(id)}>Group 1 Item 1</TestFocusable>
        <TestFocusable id="group1-item2" onFocus={id => focusOrder.push(id)}>Group 1 Item 2</TestFocusable>
      </FocusGroupComponent>
      <FocusGroupComponent>
        <TestFocusable id="group2-item1" onFocus={id => focusOrder.push(id)}>Group 2 Item 1</TestFocusable>
        <TestFocusable id="group2-item2" onFocus={id => focusOrder.push(id)}>Group 2 Item 2</TestFocusable>
      </FocusGroupComponent>
    </Box>
  );

  await global.sleep(50);
  
  // Focus first group
  simulateTab(stdin);
  await global.sleep(50);
  
  // Tab to second group
  simulateTab(stdin);
  await global.sleep(50);
  
  // Shift+Tab back to first group
  simulateShiftTab(stdin);
  await global.sleep(50);

  t.is(lastFocusedId, 'group1-item1');
  t.deepEqual(focusOrder, ['group1-item1', 'group2-item1', 'group1-item1']);
});

test('Shift+Tab navigation: cycles to bottom-right-most when at beginning', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <FocusGroupComponent>
        <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
        <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
        <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
      </FocusGroupComponent>
    </Box>
  );

  await global.sleep(50);
  
  // Focus first item
  simulateTab(stdin);
  await global.sleep(50);
  
  // Shift+Tab should cycle to last item
  simulateShiftTab(stdin);
  await global.sleep(50);

  t.is(lastFocusedId, 'item3');
  t.deepEqual(focusOrder, ['item1', 'item3']);
});

// Test horizontal and vertical lists
test('List navigation: horizontal list focuses left-to-right', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <List orientation="horizontal">
      <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
      <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
      <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
    </List>
  );

  await global.sleep(50);
  
  simulateTab(stdin);
  await global.sleep(50);

  // Should focus leftmost item first
  t.is(lastFocusedId, 'item1');
  t.deepEqual(focusOrder, ['item1']);
});

test('List navigation: vertical list focuses top-to-bottom', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <List orientation="vertical">
      <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
      <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
      <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
    </List>
  );

  await global.sleep(50);
  
  simulateTab(stdin);
  await global.sleep(50);

  // Should focus topmost item first
  t.is(lastFocusedId, 'item1');
  t.deepEqual(focusOrder, ['item1']);
});

// Test complex nested structure
test('Complex navigation: nested groups with multiple levels', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <FocusGroupComponent>
        <TestFocusable id="root1" onFocus={id => focusOrder.push(id)}>Root 1</TestFocusable>
        <FocusGroupComponent>
          <TestFocusable id="child1" onFocus={id => focusOrder.push(id)}>Child 1</TestFocusable>
          <FocusGroupComponent>
            <TestFocusable id="grandchild1" onFocus={id => focusOrder.push(id)}>Grandchild 1</TestFocusable>
            <TestFocusable id="grandchild2" onFocus={id => focusOrder.push(id)}>Grandchild 2</TestFocusable>
          </FocusGroupComponent>
          <TestFocusable id="child2" onFocus={id => focusOrder.push(id)}>Child 2</TestFocusable>
        </FocusGroupComponent>
        <TestFocusable id="root2" onFocus={id => focusOrder.push(id)}>Root 2</TestFocusable>
      </FocusGroupComponent>
      <FocusGroupComponent>
        <TestFocusable id="sibling1" onFocus={id => focusOrder.push(id)}>Sibling 1</TestFocusable>
      </FocusGroupComponent>
    </Box>
  );

  await global.sleep(50);
  
  // Test forward navigation through all elements
  const expectedOrder = ['root1', 'child1', 'grandchild1', 'grandchild2', 'child2', 'root2', 'sibling1'];
  
  for (let i = 0; i < expectedOrder.length; i++) {
    simulateTab(stdin);
    await global.sleep(50);
  }

  // Check that we visited all elements in the correct order
  t.deepEqual(focusOrder, expectedOrder);
  t.is(lastFocusedId, 'sibling1');
});

// Test edge cases
test('Edge case: empty focus group', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box>
      <FocusGroupComponent>
        {/* Empty group */}
      </FocusGroupComponent>
      <FocusGroupComponent>
        <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
      </FocusGroupComponent>
    </Box>
  );

  await global.sleep(50);
  
  // Tab should skip empty group and focus item1
  simulateTab(stdin);
  await global.sleep(50);

  t.is(lastFocusedId, 'item1');
  t.deepEqual(focusOrder, ['item1']);
});

test('Edge case: single focusable element', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <FocusGroupComponent>
      <TestFocusable id="only" onFocus={id => focusOrder.push(id)}>Only Item</TestFocusable>
    </FocusGroupComponent>
  );

  await global.sleep(50);
  
  // Tab should focus the only element
  simulateTab(stdin);
  await global.sleep(50);
  
  // Another tab should stay on the same element
  simulateTab(stdin);
  await global.sleep(50);

  // Should have focused the same element twice
  t.is(lastFocusedId, 'only');
  t.deepEqual(focusOrder, ['only', 'only']);
});

// Test focus group navigation within nested structures
test('Focus groups: navigate between deeply nested groups', async t => {
  const focusOrder: string[] = [];
  
  const { stdin } = render(
    <Box flexDirection="column">
      <Box>
        <FocusGroupComponent>
          <TestFocusable id="top-left" onFocus={id => focusOrder.push(id)}>Top Left</TestFocusable>
          <TestFocusable id="top-center" onFocus={id => focusOrder.push(id)}>Top Center</TestFocusable>
        </FocusGroupComponent>
        <FocusGroupComponent>
          <TestFocusable id="top-right" onFocus={id => focusOrder.push(id)}>Top Right</TestFocusable>
        </FocusGroupComponent>
      </Box>
      <Box>
        <FocusGroupComponent>
          <TestFocusable id="bottom-left" onFocus={id => focusOrder.push(id)}>Bottom Left</TestFocusable>
        </FocusGroupComponent>
        <FocusGroupComponent>
          <TestFocusable id="bottom-right" onFocus={id => focusOrder.push(id)}>Bottom Right</TestFocusable>
        </FocusGroupComponent>
      </Box>
    </Box>
  );

  await global.sleep(50);
  
  // Navigate through all groups
  simulateTab(stdin); // top-left
  await global.sleep(50);
  
  simulateTab(stdin); // top-right (next sibling group)
  await global.sleep(50);
  
  simulateTab(stdin); // bottom-left (no more siblings, go to parent's next)
  await global.sleep(50);
  
  simulateTab(stdin); // bottom-right
  await global.sleep(50);

  t.deepEqual(focusOrder, ['top-left', 'top-right', 'bottom-left', 'bottom-right']);
});

test('Focus state: verify focus indicators are shown correctly', async t => {
  let output = '';
  
  const { stdin, lastFrame } = render(
    <Box>
      <TestFocusable id="item1">First</TestFocusable>
      <TestFocusable id="item2">Second</TestFocusable>
      <TestFocusable id="item3">Third</TestFocusable>
    </Box>
  );

  await global.sleep(50);
  
  // Focus first item
  simulateTab(stdin);
  await global.sleep(50);
  
  output = lastFrame() || '';
  t.true(output.includes('First [FOCUSED]'));
  t.false(output.includes('Second [FOCUSED]'));
  t.false(output.includes('Third [FOCUSED]'));
  
  // Focus second item
  simulateTab(stdin);
  await global.sleep(50);
  
  output = lastFrame() || '';
  t.false(output.includes('First [FOCUSED]'));
  t.true(output.includes('Second [FOCUSED]'));
  t.false(output.includes('Third [FOCUSED]'));
});
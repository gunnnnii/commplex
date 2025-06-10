import { describe, test, expect, beforeEach } from 'vitest';
import * as React from 'react';
import { render } from 'ink-testing-library';
import { Box, Text, useFocus } from 'ink';
import { FocusGroupComponent, List } from '../../../source/models/interactive/focus-groups';
import { Focusable } from '../../../source/models/interactive/interactive';
import { InputEvent } from '../../../source/models/interactive/event';

const { useEffect } = React;

// Ensure window node is available
import '../../../source/models/interactive/node';

// Track which element has focus
let focusedElements: Set<string> = new Set();
let lastFocusedId: string | null = null;

// Helper to simulate keyboard input via window events
const simulateKeyPress = (key: string, shift = false) => {
  // Create a full Key object with all required properties
  const keyObject = {
    upArrow: false,
    downArrow: false,
    leftArrow: false,
    rightArrow: false,
    pageDown: false,
    pageUp: false,
    return: false,
    escape: false,
    ctrl: false,
    shift: false,
    tab: false,
    backspace: false,
    delete: false,
    meta: false,
  };
  
  if (key === '\t') {
    keyObject.tab = true;
    keyObject.shift = shift;
  } else if (key === '\u001B[Z') {
    keyObject.tab = true;
    keyObject.shift = true;
  }
  
  // Create input event with input string and key object
  const event = new InputEvent(key, keyObject);
  
  // Dispatch the event on the window node
  globalThis.windowNode.dispatchEvent(event);
};

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

// Helper to wait for async operations
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Focus Navigation', () => {
  beforeEach(() => {
    resetFocusTracking();
  });

  // Test scenarios for Tab (forward) navigation
  test('Tab navigation: no active element focuses top-left-most focusable element', async () => {
    const focusOrder: string[] = [];
    
    render(
      <Box>
        <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
        <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
        <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
      </Box>
    );

    await sleep(50);
    
    // Simulate Tab key press
    simulateKeyPress('\t');
    await sleep(50);

    // Verify first element is focused
    expect(lastFocusedId).toBe('item1');
    expect(focusOrder).toEqual(['item1']);
  });

  test('Tab navigation: focus group with child group focuses child', async () => {
    const focusOrder: string[] = [];
    
    render(
      <FocusGroupComponent>
        <TestFocusable id="parent1" onFocus={id => focusOrder.push(id)}>Parent 1</TestFocusable>
        <FocusGroupComponent>
          <TestFocusable id="child1" onFocus={id => focusOrder.push(id)}>Child 1</TestFocusable>
          <TestFocusable id="child2" onFocus={id => focusOrder.push(id)}>Child 2</TestFocusable>
        </FocusGroupComponent>
      </FocusGroupComponent>
    );

    await sleep(50);
    
    // First tab should focus parent1
    simulateKeyPress('\t');
    await sleep(50);
    
    // Second tab should focus child group (child1)
    simulateKeyPress('\t');
    await sleep(50);

    expect(lastFocusedId).toBe('child1');
    expect(focusOrder).toEqual(['parent1', 'child1']);
  });

  test('Tab navigation: focus group with next sibling focuses sibling', async () => {
    const focusOrder: string[] = [];
    
    render(
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

    await sleep(50);
    
    // Focus first group
    simulateKeyPress('\t');
    await sleep(50);
    
    // Tab to next sibling group
    simulateKeyPress('\t');
    await sleep(50);

    expect(lastFocusedId).toBe('group2-item1');
    expect(focusOrder).toEqual(['group1-item1', 'group2-item1']);
  });

  test('Tab navigation: parent group with next sibling focuses parent', async () => {
    const focusOrder: string[] = [];
    
    render(
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

    await sleep(50);
    
    // Focus first group
    simulateKeyPress('\t');
    await sleep(50);
    
    // Focus nested group
    simulateKeyPress('\t');
    await sleep(50);
    
    // Tab should go to parent's next sibling
    simulateKeyPress('\t');
    await sleep(50);

    expect(lastFocusedId).toBe('group2-item1');
    expect(focusOrder).toEqual(['group1-item1', 'nested-item1', 'group2-item1']);
  });

  test('Tab navigation: cycles to top-left-most when at end', async () => {
    const focusOrder: string[] = [];
    
    render(
      <Box>
        <FocusGroupComponent>
          <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
          <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
        </FocusGroupComponent>
      </Box>
    );

    await sleep(50);
    
    // Focus first item
    simulateKeyPress('\t');
    await sleep(50);
    
    // Focus second item
    simulateKeyPress('\t');
    await sleep(50);
    
    // Tab should cycle back to first item
    simulateKeyPress('\t');
    await sleep(50);

    expect(lastFocusedId).toBe('item1');
    // Item1 appears twice in the order
    expect(focusOrder.filter(id => id === 'item1').length).toBe(2);
  });

  // Test scenarios for Shift+Tab (backward) navigation
  test('Shift+Tab navigation: no active element focuses bottom-right-most element', async () => {
    const focusOrder: string[] = [];
    
    render(
      <Box>
        <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
        <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
        <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
      </Box>
    );

    await sleep(50);
    
    // Simulate Shift+Tab key press
    simulateKeyPress('\u001B[Z');
    await sleep(50);

    // Should focus the last element
    expect(lastFocusedId).toBe('item3');
    expect(focusOrder).toEqual(['item3']);
  });

  test('Shift+Tab navigation: focus group with previous sibling focuses sibling', async () => {
    const focusOrder: string[] = [];
    
    render(
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

    await sleep(50);
    
    // Focus first group
    simulateKeyPress('\t');
    await sleep(50);
    
    // Tab to second group
    simulateKeyPress('\t');
    await sleep(50);
    
    // Shift+Tab back to first group
    simulateKeyPress('\u001B[Z');
    await sleep(50);

    expect(lastFocusedId).toBe('group1-item1');
    expect(focusOrder).toEqual(['group1-item1', 'group2-item1', 'group1-item1']);
  });

  test('Shift+Tab navigation: cycles to bottom-right-most when at beginning', async () => {
    const focusOrder: string[] = [];
    
    render(
      <Box>
        <FocusGroupComponent>
          <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
          <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
          <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
        </FocusGroupComponent>
      </Box>
    );

    await sleep(50);
    
    // Focus first item
    simulateKeyPress('\t');
    await sleep(50);
    
    // Shift+Tab should cycle to last item
    simulateKeyPress('\u001B[Z');
    await sleep(50);

    expect(lastFocusedId).toBe('item3');
    expect(focusOrder).toEqual(['item1', 'item3']);
  });

  // Test horizontal and vertical lists
  test('List navigation: horizontal list focuses left-to-right', async () => {
    const focusOrder: string[] = [];
    
    render(
      <List orientation="horizontal">
        <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
        <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
        <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
      </List>
    );

    await sleep(50);
    
    simulateKeyPress('\t');
    await sleep(50);

    // Should focus leftmost item first
    expect(lastFocusedId).toBe('item1');
    expect(focusOrder).toEqual(['item1']);
  });

  test('List navigation: vertical list focuses top-to-bottom', async () => {
    const focusOrder: string[] = [];
    
    render(
      <List orientation="vertical">
        <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
        <TestFocusable id="item2" onFocus={id => focusOrder.push(id)}>Item 2</TestFocusable>
        <TestFocusable id="item3" onFocus={id => focusOrder.push(id)}>Item 3</TestFocusable>
      </List>
    );

    await sleep(50);
    
    simulateKeyPress('\t');
    await sleep(50);

    // Should focus topmost item first
    expect(lastFocusedId).toBe('item1');
    expect(focusOrder).toEqual(['item1']);
  });

  // Test complex nested structure
  test('Complex navigation: nested groups with multiple levels', async () => {
    const focusOrder: string[] = [];
    
    render(
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

    await sleep(50);
    
    // Test forward navigation through all elements
    const expectedOrder = ['root1', 'child1', 'grandchild1', 'grandchild2', 'child2', 'root2', 'sibling1'];
    
    for (let i = 0; i < expectedOrder.length; i++) {
      simulateKeyPress('\t');
      await sleep(50);
    }

    // Check that we visited all elements in the correct order
    expect(focusOrder).toEqual(expectedOrder);
    expect(lastFocusedId).toBe('sibling1');
  });

  // Test edge cases
  test('Edge case: empty focus group', async () => {
    const focusOrder: string[] = [];
    
    render(
      <Box>
        <FocusGroupComponent>
          {/* Empty group */}
        </FocusGroupComponent>
        <FocusGroupComponent>
          <TestFocusable id="item1" onFocus={id => focusOrder.push(id)}>Item 1</TestFocusable>
        </FocusGroupComponent>
      </Box>
    );

    await sleep(50);
    
    // Tab should skip empty group and focus item1
    simulateKeyPress('\t');
    await sleep(50);

    expect(lastFocusedId).toBe('item1');
    expect(focusOrder).toEqual(['item1']);
  });

  test('Edge case: single focusable element', async () => {
    const focusOrder: string[] = [];
    
    render(
      <FocusGroupComponent>
        <TestFocusable id="only" onFocus={id => focusOrder.push(id)}>Only Item</TestFocusable>
      </FocusGroupComponent>
    );

    await sleep(50);
    
    // Tab should focus the only element
    simulateKeyPress('\t');
    await sleep(50);
    
    // Another tab should stay on the same element
    simulateKeyPress('\t');
    await sleep(50);

    // Should have focused the same element twice
    expect(lastFocusedId).toBe('only');
    expect(focusOrder).toEqual(['only', 'only']);
  });

  // Test focus group navigation within nested structures
  test('Focus groups: navigate between deeply nested groups', async () => {
    const focusOrder: string[] = [];
    
    render(
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

    await sleep(50);
    
    // Navigate through all groups
    simulateKeyPress('\t'); // top-left
    await sleep(50);
    
    simulateKeyPress('\t'); // top-right (next sibling group)
    await sleep(50);
    
    simulateKeyPress('\t'); // bottom-left (no more siblings, go to parent's next)
    await sleep(50);
    
    simulateKeyPress('\t'); // bottom-right
    await sleep(50);

    expect(focusOrder).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  });

  test('Focus state: verify focus indicators are shown correctly', async () => {
    let output = '';
    
    const { lastFrame } = render(
      <Box>
        <TestFocusable id="item1">First</TestFocusable>
        <TestFocusable id="item2">Second</TestFocusable>
        <TestFocusable id="item3">Third</TestFocusable>
      </Box>
    );

    await sleep(50);
    
    // Focus first item
    simulateKeyPress('\t');
    await sleep(50);
    
    output = lastFrame() || '';
    expect(output).toContain('First [FOCUSED]');
    expect(output).not.toContain('Second [FOCUSED]');
    expect(output).not.toContain('Third [FOCUSED]');
    
    // Focus second item
    simulateKeyPress('\t');
    await sleep(50);
    
    output = lastFrame() || '';
    expect(output).not.toContain('First [FOCUSED]');
    expect(output).toContain('Second [FOCUSED]');
    expect(output).not.toContain('Third [FOCUSED]');
  });
});
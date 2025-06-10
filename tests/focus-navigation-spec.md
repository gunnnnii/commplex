# Focus Navigation Test Specification

This document outlines the focus navigation behavior for the Ink-based terminal app and how it's tested.

## Navigation Rules

### Forward Navigation (Tab)

1. **No active element**: Focus on the top-left-most focusable element on the screen
2. **Active element in focus group**:
   - If the focus group has a child group → focus the child group
   - Else if the focus group has a next sibling group → focus the sibling group
   - Else if the focus group has a parent group and the parent group has a next sibling group → focus the parent group
   - Else → focus on the top-left-most focusable element on the screen (cycle back)

### Backward Navigation (Shift+Tab)

1. **No active element**: Focus on the bottom-right-most focus group or focusable element on the screen
2. **Active element in focus group**:
   - If the focus group has a child group → focus the child group
   - Else if the focus group has a previous sibling group → focus the sibling group
   - Else if the focus group has a parent group and the parent group has a previous sibling group → focus the parent group
   - Else → focus on the bottom-right-most focus group or focusable element on the screen (cycle back)

### Group Entry

When focusing into a group (both forward and backward), the system should focus the top-left-most element in that group.

## Test Implementation

The tests use `ink-testing-library` to render Ink components and simulate keyboard input.

### Test Helpers

1. **TestFocusable**: A wrapper component that tracks focus state and displays [FOCUSED] when focused
2. **simulateTab/simulateShiftTab**: Helper functions to simulate Tab and Shift+Tab key presses
3. **Focus tracking**: Global variables track which elements have been focused and in what order

### Test Scenarios

1. **Basic Navigation**: Tests Tab/Shift+Tab with simple focusable elements
2. **Focus Groups**: Tests navigation between and within focus groups
3. **Nested Groups**: Tests deep nesting of focus groups
4. **Lists**: Tests horizontal and vertical list navigation
5. **Edge Cases**: Tests empty groups and single-element scenarios

### Running Tests

```bash
# Run all focus navigation tests
pnpm test tests/models/interactive/focus-navigation.test.tsx

# Run all tests
pnpm test
```

## Implementation Notes

- The `useFocus` hook from Ink is used to track focus state
- Focus groups are implemented using the `FocusGroupComponent` from the app
- Tests use `async/await` with delays to ensure focus changes are processed
- The test output includes visual indicators ([FOCUSED]) to verify correct behavior
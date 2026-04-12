# SysCV UI Specification Contract

This document is formatted for ingestion by the **Stitch** frontend generation engine.

## Product Context
SysCV is an educational local syscall visualizer for C programs. The frontend should evoke the feeling of a premium dark-mode algorithm visualizer (modern, clean, technical, high-contrast neon highlights on dark slate backgrounds). Focus on typography and smooth CSS transitions.

## Layout Specs
We require a fixed 2-pane column layout.
- Container: Full screen `h-screen w-screen bg-neutral-900 text-white font-sans overflow-hidden flex flex-col`.
- **Top Header bar**: Minimalist. 
  - Left side: "SysCV" logo mark (use a glowing neon green or cyan color for the brand text).
  - Right side: Global App Controls: 
    - "Run Code" Button (Primary accented button, green)
    - "Stop / Clear" Button (Secondary ghost button)
- **Main Working Area** (`flex-1 flex flex-row`):
  - **Left Pane (60% width)**: Code Editor Panel.
    - Give it a subtle rounded border, dark grey background.
    - Leave an empty standard `div` with an explicit ID `<div id="monaco-editor-placeholder" className="h-full w-full"></div>`. *DO NOT implement Monaco yet, just style the container.*
  - **Right Pane (40% width)**: Trace Log Panel.
    - Visual distinct background (e.g. slightly darker/lighter than the left pane, like `bg-neutral-950`).
    - Create a nice panel header: "Syscall Trace" with a "Clear Log" icon button (use lucide-react Trash2).
    - The body should be a vertically scrolling container holding Mock Syscall items.

## Trace Log Items (Mock Data Design)
Design a reusable React Component `<SyscallItem />` for the right pane.
- **Props**: `name` (string), `description` (string), `args` (array of objects), `result` (string).
- **Styling**:
  - Should look like a sleek terminal output mixed with a GUI element.
  - The `name` (e.g. `write`) should be bold and color-coded.
  - The `args` should be displayed underneath as chips or monospaced inline text: `fd=1, buf="Hello", count=5`
  - The `result` should be aligned right or appended to the bottom of the card: `-> 5`
  - Include an expansion/collapse toggle (lucide `ChevronDown`) to reveal the `description` text payload.

## State Requirements
- Please expose standard React `useState` hooks or callback props for the buttons.
- Expose a `TraceLog` list state taking an array of objects imitating the props above.

## Constraints
- Produce all CSS via Tailwind.
- Use `lucide-react` for any icon graphics.
- Do NOT build out the complex node-graph visualizer canvas yet. This is just the Editor / Log foundation!

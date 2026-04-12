# Design System Document: The Kinetic Terminal

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Pulse"**
This design system moves away from static, boxy dashboards toward a "living" terminal experience. It treats algorithm visualization not as a chart, but as a high-end forensic tool. By leveraging intentional asymmetry, "glass-on-glass" layering, and neon-pulse accents, we create an environment that feels both authoritative and hyper-modern. The goal is to make the user feel like they are looking through a high-contrast HUD (Heads-Up Display) rather than a standard web application.

## 2. Colors & Surface Philosophy
The palette is rooted in deep obsidian tones, punctuated by high-energy primary tokens that simulate glowing hardware indicators.

### The "No-Line" Rule
Traditional 1px borders are strictly prohibited for structural sectioning. We define space through **tonal transitions**. 
- A `surface-container-low` panel sits on a `surface` background. 
- The contrast is felt, not seen as a line. This mimics how high-end electronics are constructed—seamless transitions between materials.

### Surface Hierarchy & Nesting
Depth is achieved through the "stacking" of the surface-container tiers:
1.  **Base Layer:** `surface` (#0e0e0e) - The infinite void.
2.  **Sectional Layer:** `surface-container` (#1a1919) - The primary work area.
3.  **Active Component Layer:** `surface-container-highest` (#262626) - Modals, active algorithm nodes, or focused terminal prompts.

### The Glass & Gradient Rule
To provide "soul" to the technical aesthetic:
- **Glassmorphism:** Floating panels (like tooltips or HUD overlays) must use `surface-container-lowest` with a 12px backdrop-blur and 60% opacity.
- **Signature Gradients:** For primary CTAs and progress indicators, use a linear gradient from `primary` (#4dfe90) to `primary-container` (#29e67c) at a 135-degree angle. This simulates a laser-etched glow rather than a flat plastic button.

## 3. Typography
The system uses a dual-type approach: **Space Grotesk** for technical authority and **Manrope** for human readability.

- **Display & Headlines (Space Grotesk):** These are the "System Status" indicators. High-contrast, wide tracking, and aggressive scales. They should feel like they were pulled from a mainframe.
- **Body & Labels (Manrope):** The "Operator Layer." Used for descriptions and UI controls where legibility is paramount.
- **Monospace (Trace Logs):** Use a high-quality mono-font for code execution and trace logs to maintain the "Terminal" spirit.

*Design Note: Use `label-sm` in uppercase with 0.05em letter-spacing for all technical metadata to lean into the "industrial" feel.*

## 4. Elevation & Depth
In this system, light doesn't come from "above"—it comes from the "screen" itself.

- **The Layering Principle:** Instead of shadows, use `surface-container-low` to `surface-container-highest`. An inner card should always be one step higher in the tier than its parent container.
- **Ambient Glow:** Replace "Drop Shadows" with "Ambient Glows." When an element is focused, apply a soft, 20px blur of the `primary` color at 5% opacity. It should look like the neon light is reflecting off the dark slate background.
- **The Ghost Border Fallback:** If accessibility requires a stroke, use `outline-variant` at 15% opacity. Never use solid #FFFFFF borders.

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), black text (`on-primary`), `md` (0.375rem) roundedness. 
- **Secondary:** Transparent background with a `ghost border`. On hover, transition to `surface-container-high` background.
- **Tertiary:** No background, `primary` text. Used for low-priority actions in trace logs.

### Terminal & Code Blocks
- Background: `surface-container-lowest` (pure black #000000).
- Padding: `xl` (1.5rem) to give the code "room to breathe."
- Texture: A subtle scanline overlay (0.02 opacity) to enhance the terminal aesthetic.

### Algorithm Nodes (Visualizer)
- Use `primary` (#4dfe90) for "Active" states and `tertiary` (#7ce6ff) for "Processing" states.
- Forbid lines: Separate nodes using the Spacing Scale (16px/24px) or subtle tonal shifts.

### Input Fields
- Background: `surface-container-low`.
- Active State: A 1px `primary` underline (not a full border) to mimic a command-line cursor.

### Chips (Data Tags)
- Small, `sm` (0.125rem) roundedness. 
- Colors: `secondary-container` backgrounds with `on-secondary-container` text.

## 6. Do’s and Don’ts

### Do:
- **Use Intentional Asymmetry:** Align technical data to the right while labels stay left to break the "template" feel.
- **Lean into High Contrast:** Ensure `on-surface` text is pure white against the dark slate for maximum readability.
- **Animate Transitions:** Use `cubic-bezier(0.4, 0, 0.2, 1)` for all surface transitions to create a "slick" high-tech feel.

### Don't:
- **Don't use Divider Lines:** If you feel the need for a line, use 16px of vertical whitespace instead.
- **Don't use Rounded Corners > 12px:** We are building a professional tool, not a consumer social app. Keep corners "subtle" (`md` or `lg` scale).
- **Don't use Pure Grey:** Always ensure your neutrals have a hint of "Slate" or "Cold Blue" to keep the palette feeling premium and intentional.
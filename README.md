# Pi Blinking Cursor

A Pi package that replaces the TUI editor's static reverse-video cursor with an activity-aware terminal hardware cursor.

## Behavior

- The active editor uses a blinking vertical bar.
- While an agent run is active, an inactive empty editor uses a steady underline across message streaming, tool execution, retries, and automatic continuations.
- Clicking, dragging, or typing inside the editor restores the blinking bar for at least three seconds.
- Unsent editor text keeps the blinking bar active after the inactivity period.
- If the editor is empty and receives no activity for three seconds while streaming continues, the cursor returns to a steady underline.
- A non-empty fullscreen transcript selection also changes the cursor to a steady underline.
- Exiting Pi restores the terminal's configured default cursor style.

The terminal remains responsible for its cursor appearance when the entire terminal pane or window loses operating-system focus.

## Requirements

- Pi 1.0.0 or newer
- Node.js 22.19 or newer
- A terminal that supports `DECSCUSR` cursor-shape sequences

No manual Pi setting is required. The extension enables the hardware cursor for its session, reasserts it after `/reload` reapplies persisted display settings, and restores the user's previous `showHardwareCursor` value when the session shuts down.

## Try or install locally

Run the package for one invocation:

```bash
pi -e .
```

Or install the local package persistently:

```bash
pi install .
```

Run `/reload` after changing the extension source.

## Install after publication

```bash
pi install npm:pi-blinking-cursor
```

## How it works

The extension temporarily enables Pi's hardware cursor, subclasses `CustomEditor`, preserves Pi's hardware-cursor marker, and removes only the built-in editor's reverse-video opening sequence at that marker. It restores the previous hardware-cursor preference on shutdown. It also enables `embedWorkingStatus`, matching Pi's default editor so the Working label and spinner remain on the upper editor border.

It requests cursor shapes with standard `DECSCUSR` sequences:

- `CSI 5 SP q`: blinking bar
- `CSI 4 SP q`: steady underline
- `CSI 0 SP q`: terminal-configured default

The `agent_start` and `agent_settled` events define the complete active interval without gaps between messages, tools, retries, or automatic continuations. Editor input and mouse events provide activity, with a three-second idle timer. Fullscreen transcript selection is detected through Pi's `hasActiveSelection()` capability.

## Compatibility

The cursor sequences are supported by Windows Terminal and xterm.js-based terminals, including the VS Code and VSCodium integrated terminals.

Transcript-selection detection is available in fullscreen mode. Regular mode still uses the hardware cursor, but native terminal scrollback selection does not trigger the underline state. `hasActiveSelection()` is not currently part of Pi's public `TUI` type, so a future Pi update may require that integration point to change.

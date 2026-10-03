// Replaces Pi's static fake cursor with the terminal's blinking vertical cursor.
import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  CURSOR_MARKER,
  type TUI,
  type TuiMouseEvent,
  type TuiMouseEventResult,
} from "@earendil-works/pi-tui";

const BLINKING_BAR_CURSOR = "\x1b[5 q";
const STEADY_UNDERLINE_CURSOR = "\x1b[4 q";
const USER_DEFAULT_CURSOR = "\x1b[0 q";
const REVERSE_VIDEO = "\x1b[7m";
const EDITOR_IDLE_DELAY_MS = 3000;

type SelectionAwareTui = {
  hasActiveSelection?: () => boolean;
};

// Preserve the hardware-cursor marker while tracking editor, selection, and streaming activity.
class HardwareCursorEditor extends CustomEditor {
  private agentActive = false;
  private lastEditorActivity = 0;
  private cursorMode: "bar" | "underline" = "bar";
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  // Record keyboard activity after applying the editor's normal input behavior.
  handleInput(data: string): void {
    super.handleInput(data);
    this.recordEditorActivity();
  }

  // Treat clicks and drags inside the editor as explicit editor activation.
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const result = super.handleMouse(event);
    if (event.type === "press" || event.type === "click" || event.type === "drag") {
      this.recordEditorActivity();
    }
    return result;
  }

  // Render without Pi's fake cursor and synchronize selection-dependent cursor state.
  render(width: number): string[] {
    this.updateCursorMode();

    // Remove reverse video only when it immediately follows Pi's hardware-cursor marker.
    return super.render(width).map((line) => {
      const markerIndex = line.indexOf(CURSOR_MARKER);
      if (markerIndex === -1) return line;

      const markerEnd = markerIndex + CURSOR_MARKER.length;
      if (!line.startsWith(REVERSE_VIDEO, markerEnd)) return line;
      return line.slice(0, markerEnd) + line.slice(markerEnd + REVERSE_VIDEO.length);
    });
  }

  // Enter or leave the temporary inactive state used while an agent run remains active.
  setAgentActive(active: boolean): void {
    this.agentActive = active;
    if (active && this.getText().length === 0) {
      this.lastEditorActivity = 0;
    }
    if (!active) {
      this.clearIdleTimer();
    }
    this.updateCursorMode();
  }

  // Release the session-scoped inactivity timer during reload or shutdown.
  disposeCursorState(): void {
    this.clearIdleTimer();
  }

  // Keep the editor active for three seconds after interaction, or while it contains a draft.
  private recordEditorActivity(): void {
    this.lastEditorActivity = Date.now();
    this.updateCursorMode();
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.updateCursorMode();
    }, EDITOR_IDLE_DELAY_MS);
  }

  // Select the cursor from transcript selection, streaming, draft, and recent-activity state.
  private updateCursorMode(): void {
    const selectionActive =
      (this.tui as typeof this.tui & SelectionAwareTui).hasActiveSelection?.() ?? false;
    const recentlyActive = Date.now() - this.lastEditorActivity < EDITOR_IDLE_DELAY_MS;
    const hasDraft = this.getText().length > 0;
    const editorActive =
      !selectionActive && (!this.agentActive || recentlyActive || hasDraft);
    this.setCursorMode(editorActive ? "bar" : "underline");
  }

  // Write a cursor sequence only when the requested mode changes, preserving blink timing.
  private setCursorMode(mode: "bar" | "underline"): void {
    if (this.cursorMode === mode) return;
    process.stdout.write(mode === "bar" ? BLINKING_BAR_CURSOR : STEADY_UNDERLINE_CURSOR);
    this.cursorMode = mode;
  }

  // Cancel a pending inactivity transition without leaving a live session timer.
  private clearIdleTimer(): void {
    if (this.idleTimer === undefined) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
  }
}

// Install the activity-aware hardware cursor only for interactive TUI sessions.
export default function blinkingCursor(pi: ExtensionAPI) {
  let editor: HardwareCursorEditor | undefined;
  let renderer: TUI | undefined;
  let previousHardwareCursorSetting: boolean | undefined;
  let pendingHardwareCursorEnable: ReturnType<typeof setImmediate> | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      renderer = tui;
      previousHardwareCursorSetting = tui.getShowHardwareCursor();
      tui.setShowHardwareCursor(true);

      // Reassert after `/reload` reapplies persisted settings following session_start.
      pendingHardwareCursorEnable = setImmediate(() => {
        pendingHardwareCursorEnable = undefined;
        if (renderer === tui) {
          tui.setShowHardwareCursor(true);
        }
      });

      editor = new HardwareCursorEditor(tui, theme, keybindings, {
        embedWorkingStatus: true,
      });
      return editor;
    });
    process.stdout.write(BLINKING_BAR_CURSOR);
  });

  // Keep the inactive streaming state across messages, tools, retries, and continuations.
  pi.on("agent_start", () => {
    editor?.setAgentActive(true);
  });

  // Return to ordinary editor behavior only after all automatic agent activity settles.
  pi.on("agent_settled", () => {
    editor?.setAgentActive(false);
  });

  // Release timers and restore the user's hardware-cursor preference and terminal style.
  pi.on("session_shutdown", (_event, ctx) => {
    editor?.disposeCursorState();
    editor = undefined;
    if (pendingHardwareCursorEnable !== undefined) {
      clearImmediate(pendingHardwareCursorEnable);
      pendingHardwareCursorEnable = undefined;
    }
    if (renderer && previousHardwareCursorSetting !== undefined) {
      renderer.setShowHardwareCursor(previousHardwareCursorSetting);
    }
    renderer = undefined;
    previousHardwareCursorSetting = undefined;
    if (ctx.mode === "tui") {
      process.stdout.write(USER_DEFAULT_CURSOR);
    }
  });
}

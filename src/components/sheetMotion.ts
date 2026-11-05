/**
 * Motion and state of ScanFlow's bottom sheets (`BottomSheet.tsx`).
 *
 * iOS-style sheet: the backdrop fades in while the sheet glides up with a
 * soft spring, the sheet can be pulled down to close it, and `onDismiss` is
 * reported once the sheet and its native modal are completely gone – only
 * then may the next modal, the share sheet or the scanner be presented (see
 * modalHandoff.ts and AGENTS.md rule 9).
 *
 * The React Native `<Modal>` itself is presented without animation
 * (`animationType="none"`). All motion uses one value: the sheet's offset in
 * points below its open position (0 = open, sheet height = hidden). The
 * backdrop opacity is derived from it, so backdrop and sheet always move
 * together – also while the sheet is dragged.
 *
 * Pure TypeScript (no React / React Native imports) → unit-tested in Node.
 * `SheetMachine` runs the animations through an injected `SheetDriver`.
 */

/** Cubic bezier of the close animation (iOS sheet curve: starts with the finger's speed, settles softly). */
export const SHEET_CLOSE_BEZIER = [0.32, 0.72, 0, 1] as const;
/** Close without a gesture (button, backdrop tap, closed by the screen). */
export const SHEET_CLOSE_MS = 280;
/** Shortest close after a fast flick. */
export const SHEET_CLOSE_MIN_MS = 140;
/**
 * Spring of the open and the snap-back animation: damping ratio ≈ 0.81 → a
 * soft bounce of ≈ 1 % of the distance (4–8 pt), at rest after ≈ 0.55 s.
 */
export const SHEET_SPRING = {
  stiffness: 220,
  damping: 24,
  mass: 1,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 20,
} as const;

/** Finger movement (pt) before a pull starts – smaller movements stay taps. */
export const SHEET_DRAG_SLOP = 8;
/** `dragArea: 'top'`: height (pt) of the zone at the top of the sheet where a pull may start. */
export const SHEET_TOP_DRAG_ZONE = 60;
/** Release speed (pt/ms) that closes the sheet regardless of the distance … */
export const SHEET_FLICK_VELOCITY = 0.8;
/** … once it was pulled at least this far (pt). */
export const SHEET_FLICK_MIN_DISTANCE = 16;
/** Released after pulling further than this share of the sheet height … */
export const SHEET_DISMISS_FRACTION = 0.3;
/** … or further than this (pt) → the sheet closes. */
export const SHEET_DISMISS_MAX_DISTANCE = 160;
/** Moving up at least this fast (pt/ms) on release → the sheet stays open. */
export const SHEET_RETURN_VELOCITY = 0.3;
/** Maximum stretch (pt) when the sheet is pulled up. */
export const SHEET_RUBBER_LIMIT = 40;
/** Sheet-coloured area below the sheet; covers the gap while it is stretched up or bounces. */
export const SHEET_SKIRT = 200;
/** Wait for the sheet's first layout (normally less than a frame). */
export const SHEET_LAYOUT_FALLBACK_MS = 250;
/** `onDismiss` fallback when the native modal never reports its dismissal. */
export const SHEET_DISMISS_FALLBACK_MS = 1000;

/** iOS rubber band: the further the pull, the less the sheet follows; never more than `limit`. */
export function rubberBand(distance: number, limit: number = SHEET_RUBBER_LIMIT): number {
  if (!(distance > 0) || !(limit > 0)) return 0;
  return (1 - 1 / ((distance * 0.55) / limit + 1)) * limit;
}

/** Sheet offset for a finger movement `dy` since the pull started (down = 1:1, up = rubber band). */
export function dragOffset(dy: number): number {
  return dy >= 0 ? dy : -rubberBand(-dy);
}

/** A movement starts a pull once it is longer than the slop and more vertical than horizontal. */
export function isVerticalPull(dx: number, dy: number): boolean {
  return Math.abs(dy) >= SHEET_DRAG_SLOP && Math.abs(dy) > Math.abs(dx);
}

/** `dragArea: 'top'` – did the touch start in the top zone of the sheet (handle, title)? */
export function inTopDragZone(startY: number, sheetTop: number): boolean {
  return startY >= sheetTop - SHEET_DRAG_SLOP && startY <= sheetTop + SHEET_TOP_DRAG_ZONE;
}

/** Close on release? `offset` in pt (down > 0), `velocity` in pt/ms (down > 0). */
export function shouldDismiss(offset: number, velocity: number, height: number): boolean {
  if (!(offset > 0)) return false;
  if (velocity <= -SHEET_RETURN_VELOCITY) return false;
  if (velocity >= SHEET_FLICK_VELOCITY && offset >= SHEET_FLICK_MIN_DISTANCE) return true;
  return offset >= Math.min(height * SHEET_DISMISS_FRACTION, SHEET_DISMISS_MAX_DISTANCE);
}

/**
 * Duration (ms) of the close animation over `distance` pt. After a flick the
 * curve starts with the finger's speed (`velocity` in pt/ms): the close curve
 * starts y1/x1 = 2.25 times faster than its average speed.
 */
export function closeDuration(distance: number, velocity: number): number {
  if (!(distance > 0)) return SHEET_CLOSE_MIN_MS;
  if (!(velocity > 0)) return SHEET_CLOSE_MS;
  const initialSlope = SHEET_CLOSE_BEZIER[1] / SHEET_CLOSE_BEZIER[0];
  const ms = (initialSlope * distance) / velocity;
  return Math.round(Math.min(SHEET_CLOSE_MS, Math.max(SHEET_CLOSE_MIN_MS, ms)));
}

export type SheetPhase =
  | 'hidden' // modal not presented
  | 'waiting' // modal presented, waiting for the sheet's layout
  | 'opening'
  | 'open'
  | 'dragging'
  | 'settling' // springing back after a pull that did not close
  | 'closing';

export type SheetAnimation =
  | { type: 'spring'; velocity: number } // velocity in pt/ms
  | { type: 'timing'; duration: number };

export interface SheetDriver {
  /** Moves the sheet without animation (pt below the open position). */
  set(offset: number): void;
  /** Animates the sheet; `done(true)` once it arrived, `done(false)` when it was stopped. */
  animate(to: number, animation: SheetAnimation, done: (finished: boolean) => void): void;
  /** Stops a running animation. */
  stop(): void;
  /** Presents / hides the native modal. */
  present(presented: boolean): void;
}

export interface SheetOptions {
  /** The user wants to close the sheet (backdrop, pull-down, back gesture). */
  onClose: () => void;
  /** The sheet and its modal are completely gone (once per close). */
  onDismiss?: () => void;
  /** False → backdrop, pull-down and back gesture do nothing. */
  dismissible: boolean;
  /** Where a pull-down may start: anywhere on the sheet or only in its top zone. */
  dragArea: 'full' | 'top';
}

/**
 * State machine of one bottom sheet. Inputs: `setVisible` (prop), layouts,
 * gestures, the modal's native `onDismiss`. Outputs: animations and the
 * modal's presentation through the driver, `onClose` / `onDismiss`.
 */
export class SheetMachine {
  private phase: SheetPhase = 'hidden';
  private visible = false;
  private options: SheetOptions = { onClose: () => {}, dismissible: true, dragArea: 'full' };
  private height: number | null = null;
  private rootHeight: number | null = null;
  /** Sheet content is mounted (laid out) – RN keeps it until the native dismissal. */
  private contentMounted = false;
  private presented = false;
  private dragPosition = 0;
  private animationId = 0;
  private layoutTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private dismissPending = false;

  /** `parkedOffset`: offset while hidden – at least the window height, so new content never peeks out. */
  constructor(
    private readonly driver: SheetDriver,
    private readonly parkedOffset: number
  ) {}

  get currentPhase(): SheetPhase {
    return this.phase;
  }

  /** Latest props (callbacks change on every render of the screen). */
  configure(options: SheetOptions): void {
    this.options = options;
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    if (visible) this.show();
    else this.hide();
  }

  /** Height of the sheet (onLayout). */
  layoutSheet(height: number): void {
    if (!(height > 0)) return;
    this.height = height;
    this.contentMounted = true;
    if (this.phase === 'waiting') this.startOpen(true);
  }

  /** Height of the modal's root view (= window) – for the top drag zone. */
  layoutRoot(height: number): void {
    if (height > 0) this.rootHeight = height;
  }

  /** The native modal is gone (Modal.onDismiss); RN unmounts the sheet content now. */
  nativeDismissed(): void {
    this.contentMounted = false;
    this.fireDismiss();
  }

  /** Backdrop tap, back gesture: close if allowed. */
  userClose(): void {
    if (!this.visible || !this.options.dismissible) return;
    if (this.phase === 'hidden' || this.phase === 'closing') return;
    // Glide out right away; the screen sets `visible` to false in return
    if (this.phase !== 'waiting') this.startClose(0);
    this.options.onClose();
  }

  /** Should a finger movement become a pull of the sheet? (`startY`: page y of the touch start) */
  wantsDrag(dx: number, dy: number, startY: number): boolean {
    if (!this.visible || !this.options.dismissible || this.phase !== 'open') return false;
    if (!isVerticalPull(dx, dy)) return false;
    if (this.options.dragArea === 'full') return true;
    if (this.height === null || this.rootHeight === null) return false;
    return inTopDragZone(startY, this.rootHeight - this.height);
  }

  dragStart(): void {
    if (this.phase !== 'open') return;
    this.stopAnimation();
    this.phase = 'dragging';
    this.dragPosition = 0;
  }

  /** `dy`: finger movement since the pull started. */
  dragMove(dy: number): void {
    if (this.phase !== 'dragging') return;
    this.dragPosition = dragOffset(dy);
    this.driver.set(this.dragPosition);
  }

  /** `velocity` in pt/ms (down > 0). */
  dragEnd(dy: number, velocity: number): void {
    if (this.phase !== 'dragging') return;
    this.dragPosition = dragOffset(dy);
    const height = this.height ?? this.parkedOffset;
    if (this.visible && this.options.dismissible && shouldDismiss(this.dragPosition, velocity, height)) {
      this.startClose(Math.max(0, velocity));
      this.options.onClose();
    } else {
      this.settle(velocity);
    }
  }

  /** The gesture was taken away (e.g. system gesture) → back to open. */
  dragCancel(): void {
    if (this.phase !== 'dragging') return;
    this.settle(0);
  }

  /** Unmount: no timers, no animation, no late onDismiss. */
  dispose(): void {
    this.clearLayoutTimer();
    this.cancelDismiss();
    this.stopAnimation();
  }

  private show(): void {
    // A dismissal of an earlier close that has not arrived yet belongs to that close
    this.cancelDismiss();
    if (this.phase === 'hidden') {
      this.setPresented(true);
      if (this.contentMounted && this.height !== null) {
        this.startOpen(true);
      } else {
        this.phase = 'waiting';
        this.clearLayoutTimer();
        this.layoutTimer = setTimeout(() => {
          this.layoutTimer = null;
          if (this.phase === 'waiting') this.startOpen(true);
        }, SHEET_LAYOUT_FALLBACK_MS);
      }
    } else if (this.phase === 'closing') {
      this.startOpen(false); // reopened while gliding out: turn around where it is
    }
    // waiting / opening / open / dragging / settling: already shown
  }

  private hide(): void {
    if (this.phase === 'waiting') {
      this.clearLayoutTimer();
      this.finishHidden();
    } else if (this.phase !== 'hidden' && this.phase !== 'closing') {
      this.startClose(0);
    }
  }

  private startOpen(fromHidden: boolean): void {
    this.clearLayoutTimer();
    if (fromHidden) this.driver.set(this.height ?? this.parkedOffset);
    this.phase = 'opening';
    this.run(0, { type: 'spring', velocity: 0 }, () => {
      this.phase = 'open';
    });
  }

  private settle(velocity: number): void {
    this.phase = 'settling';
    this.run(0, { type: 'spring', velocity }, () => {
      this.phase = 'open';
    });
  }

  private startClose(velocity: number): void {
    const to = this.height ?? this.parkedOffset;
    const from = this.phase === 'dragging' ? this.dragPosition : 0;
    this.phase = 'closing';
    this.run(to, { type: 'timing', duration: closeDuration(to - from, velocity) }, () => this.finishClose());
  }

  private finishClose(): void {
    if (this.visible) {
      // The screen kept the sheet open (it ignored onClose) → come back
      this.startOpen(false);
      return;
    }
    this.finishHidden();
  }

  private finishHidden(): void {
    this.phase = 'hidden';
    this.driver.set(this.parkedOffset);
    this.setPresented(false);
    this.armDismiss();
  }

  private run(to: number, animation: SheetAnimation, onFinished: () => void): void {
    const id = ++this.animationId;
    this.driver.animate(to, animation, (finished) => {
      if (id !== this.animationId || !finished) return;
      onFinished();
    });
  }

  private stopAnimation(): void {
    this.animationId++;
    this.driver.stop();
  }

  private setPresented(presented: boolean): void {
    if (this.presented === presented) return;
    this.presented = presented;
    this.driver.present(presented);
  }

  private armDismiss(): void {
    this.cancelDismiss();
    this.dismissPending = true;
    this.dismissTimer = setTimeout(() => {
      this.dismissTimer = null;
      this.fireDismiss();
    }, SHEET_DISMISS_FALLBACK_MS);
  }

  private fireDismiss(): void {
    if (!this.dismissPending) return;
    this.cancelDismiss();
    this.options.onDismiss?.();
  }

  private cancelDismiss(): void {
    this.dismissPending = false;
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }

  private clearLayoutTimer(): void {
    if (this.layoutTimer !== null) {
      clearTimeout(this.layoutTimer);
      this.layoutTimer = null;
    }
  }
}

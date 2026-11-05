import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  SHEET_CLOSE_MIN_MS,
  SHEET_CLOSE_MS,
  SHEET_DISMISS_FALLBACK_MS,
  SHEET_DISMISS_MAX_DISTANCE,
  SHEET_DRAG_SLOP,
  SHEET_LAYOUT_FALLBACK_MS,
  SHEET_RUBBER_LIMIT,
  SHEET_TOP_DRAG_ZONE,
  SheetMachine,
  closeDuration,
  dragOffset,
  inTopDragZone,
  isVerticalPull,
  rubberBand,
  shouldDismiss,
  type SheetAnimation,
  type SheetDriver,
} from '../src/components/sheetMotion';

describe('sheet motion helpers', () => {
  it('rubberBand: follows less the further it is pulled and never passes the limit', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(-10)).toBe(0);
    expect(rubberBand(Number.NaN)).toBe(0);
    expect(rubberBand(4)).toBeCloseTo(4 * 0.55, 0); // small pulls ≈ 0.55 × finger
    let last = 0;
    for (const d of [10, 50, 100, 400, 5000]) {
      const v = rubberBand(d);
      expect(v).toBeGreaterThan(last);
      expect(v).toBeLessThan(SHEET_RUBBER_LIMIT);
      last = v;
    }
  });

  it('dragOffset: down 1:1, up with rubber band', () => {
    expect(dragOffset(0)).toBe(0);
    expect(dragOffset(120)).toBe(120);
    expect(dragOffset(-30)).toBeCloseTo(-rubberBand(30));
    expect(dragOffset(-1000)).toBeGreaterThan(-SHEET_RUBBER_LIMIT);
  });

  it('isVerticalPull: needs the slop and more vertical than horizontal movement', () => {
    expect(isVerticalPull(0, SHEET_DRAG_SLOP - 1)).toBe(false); // still a tap
    expect(isVerticalPull(0, SHEET_DRAG_SLOP)).toBe(true);
    expect(isVerticalPull(2, -20)).toBe(true); // up as well (rubber band)
    expect(isVerticalPull(20, 20)).toBe(false); // diagonal
    expect(isVerticalPull(40, 10)).toBe(false); // horizontal (segmented control, slider)
  });

  it('inTopDragZone: handle and title area only', () => {
    const top = 500;
    expect(inTopDragZone(top + 10, top)).toBe(true);
    expect(inTopDragZone(top + SHEET_TOP_DRAG_ZONE, top)).toBe(true);
    expect(inTopDragZone(top + SHEET_TOP_DRAG_ZONE + 1, top)).toBe(false); // slider / list
    expect(inTopDragZone(top - SHEET_DRAG_SLOP, top)).toBe(true); // edge tolerance
    expect(inTopDragZone(top - 40, top)).toBe(false);
  });

  it('shouldDismiss: distance, flick and return movement', () => {
    expect(shouldDismiss(0, 0, 400)).toBe(false);
    expect(shouldDismiss(-20, 2, 400)).toBe(false); // pulled up
    expect(shouldDismiss(100, 0, 400)).toBe(false); // < 30 % of 400
    expect(shouldDismiss(125, 0, 400)).toBe(true);
    expect(shouldDismiss(SHEET_DISMISS_MAX_DISTANCE, 0, 900)).toBe(true); // capped for tall sheets
    expect(shouldDismiss(SHEET_DISMISS_MAX_DISTANCE - 1, 0, 900)).toBe(false);
    expect(shouldDismiss(30, 1.2, 600)).toBe(true); // flick
    expect(shouldDismiss(10, 3, 600)).toBe(false); // flick, but hardly moved
    expect(shouldDismiss(300, -0.5, 600)).toBe(false); // moving back up on release
  });

  it('closeDuration: default without gesture, matches the flick speed, clamped', () => {
    expect(closeDuration(400, 0)).toBe(SHEET_CLOSE_MS);
    expect(closeDuration(0, 2)).toBe(SHEET_CLOSE_MIN_MS);
    expect(closeDuration(300, 10)).toBe(SHEET_CLOSE_MIN_MS);
    expect(closeDuration(200, 0.1)).toBe(SHEET_CLOSE_MS);
    expect(closeDuration(200, 2)).toBe(225); // 2.25 × 200 pt / 2 pt/ms
  });
});

interface AnimateCall {
  to: number;
  animation: SheetAnimation;
  done: (finished: boolean) => void;
}

class FakeDriver implements SheetDriver {
  sets: number[] = [];
  animations: AnimateCall[] = [];
  stops = 0;
  presents: boolean[] = [];
  set(offset: number): void {
    this.sets.push(offset);
  }
  animate(to: number, animation: SheetAnimation, done: (finished: boolean) => void): void {
    this.animations.push({ to, animation, done });
  }
  stop(): void {
    this.stops++;
  }
  present(presented: boolean): void {
    this.presents.push(presented);
  }
  get last(): AnimateCall {
    const a = this.animations[this.animations.length - 1];
    if (!a) throw new Error('no animation');
    return a;
  }
}

const PARKED = 852; // window height
const HEIGHT = 400;
const ROOT = 852;

function setup(options: { dismissible?: boolean; dragArea?: 'full' | 'top' } = {}) {
  const driver = new FakeDriver();
  const machine = new SheetMachine(driver, PARKED);
  const onClose = jest.fn();
  const onDismiss = jest.fn();
  machine.configure({
    onClose,
    onDismiss,
    dismissible: options.dismissible ?? true,
    dragArea: options.dragArea ?? 'full',
  });
  machine.layoutRoot(ROOT);
  return { driver, machine, onClose, onDismiss };
}

/** Opens the sheet completely (show → layout → spring finished). */
function open(s: ReturnType<typeof setup>, height = HEIGHT) {
  s.machine.setVisible(true);
  s.machine.layoutSheet(height);
  s.driver.last.done(true);
  expect(s.machine.currentPhase).toBe('open');
}

describe('SheetMachine', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens: presents the modal, waits for the layout, then springs up from below', () => {
    const s = setup();
    s.machine.setVisible(true);
    expect(s.driver.presents).toEqual([true]);
    expect(s.machine.currentPhase).toBe('waiting');
    expect(s.driver.animations).toHaveLength(0); // height unknown yet

    s.machine.layoutSheet(HEIGHT);
    expect(s.driver.sets).toEqual([HEIGHT]); // starts exactly below the screen edge
    expect(s.driver.last.to).toBe(0);
    expect(s.driver.last.animation).toEqual({ type: 'spring', velocity: 0 });
    expect(s.machine.currentPhase).toBe('opening');

    s.driver.last.done(true);
    expect(s.machine.currentPhase).toBe('open');
    expect(jest.getTimerCount()).toBe(0); // layout fallback cleared
  });

  it('opens right away when the layout arrived before visible (event order)', () => {
    const s = setup();
    s.machine.layoutSheet(HEIGHT);
    s.machine.setVisible(true);
    expect(s.driver.sets).toEqual([HEIGHT]);
    expect(s.driver.last.to).toBe(0);
  });

  it('opens after the fallback delay when no layout arrives', () => {
    const s = setup();
    s.machine.setVisible(true);
    jest.advanceTimersByTime(SHEET_LAYOUT_FALLBACK_MS - 1);
    expect(s.driver.animations).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(s.driver.sets).toEqual([PARKED]); // unknown height: from the window edge
    expect(s.driver.last.to).toBe(0);
  });

  it('closes: glides down, then hides the modal and reports onDismiss once', () => {
    const s = setup();
    open(s);
    s.machine.setVisible(false);
    expect(s.driver.last.to).toBe(HEIGHT);
    expect(s.driver.last.animation).toEqual({ type: 'timing', duration: SHEET_CLOSE_MS });
    expect(s.driver.presents).toEqual([true]); // still on screen while it glides
    expect(s.onClose).not.toHaveBeenCalled(); // closed by the screen itself

    s.driver.last.done(true);
    expect(s.machine.currentPhase).toBe('hidden');
    expect(s.driver.presents).toEqual([true, false]);
    expect(s.driver.sets[s.driver.sets.length - 1]).toBe(PARKED);
    expect(s.onDismiss).not.toHaveBeenCalled(); // waits for the native dismissal

    s.machine.nativeDismissed();
    expect(s.onDismiss).toHaveBeenCalledTimes(1);
    s.machine.nativeDismissed();
    jest.advanceTimersByTime(SHEET_DISMISS_FALLBACK_MS);
    expect(s.onDismiss).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports onDismiss after the fallback when the native event never arrives', () => {
    const s = setup();
    open(s);
    s.machine.setVisible(false);
    s.driver.last.done(true);
    jest.advanceTimersByTime(SHEET_DISMISS_FALLBACK_MS - 1);
    expect(s.onDismiss).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(s.onDismiss).toHaveBeenCalledTimes(1);
    s.machine.nativeDismissed(); // late event
    expect(s.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('backdrop tap: glides out immediately and asks the screen to close', () => {
    const s = setup();
    open(s);
    s.machine.userClose();
    expect(s.onClose).toHaveBeenCalledTimes(1);
    expect(s.machine.currentPhase).toBe('closing');
    const count = s.driver.animations.length;

    s.machine.setVisible(false); // the screen follows
    expect(s.driver.animations).toHaveLength(count); // no second close animation
    s.machine.userClose(); // second tap while closing
    expect(s.onClose).toHaveBeenCalledTimes(1);

    s.driver.last.done(true);
    expect(s.driver.presents).toEqual([true, false]);
  });

  it('not dismissible: backdrop, back gesture and pull do nothing', () => {
    const s = setup({ dismissible: false });
    open(s);
    s.machine.userClose();
    expect(s.onClose).not.toHaveBeenCalled();
    expect(s.machine.currentPhase).toBe('open');
    expect(s.machine.wantsDrag(0, 40, 600)).toBe(false);
    // … but the screen can still close it (export: before the share sheet)
    s.machine.setVisible(false);
    expect(s.machine.currentPhase).toBe('closing');
  });

  it('comes back when the screen ignores onClose', () => {
    const s = setup();
    open(s);
    s.machine.userClose();
    s.driver.last.done(true); // close finished, but visible is still true
    expect(s.driver.presents).toEqual([true]); // modal not hidden
    expect(s.driver.last.to).toBe(0);
    expect(s.driver.last.animation.type).toBe('spring');
  });

  it('pull: only vertical movements of an open, dismissible sheet', () => {
    const s = setup();
    expect(s.machine.wantsDrag(0, 40, 600)).toBe(false); // hidden
    s.machine.setVisible(true);
    s.machine.layoutSheet(HEIGHT);
    expect(s.machine.wantsDrag(0, 40, 600)).toBe(false); // still opening
    s.driver.last.done(true);
    expect(s.machine.wantsDrag(0, 40, 600)).toBe(true);
    expect(s.machine.wantsDrag(0, 4, 600)).toBe(false);
    expect(s.machine.wantsDrag(30, 10, 600)).toBe(false);
  });

  it("pull with dragArea 'top': only from the handle / title zone", () => {
    const s = setup({ dragArea: 'top' });
    open(s);
    const sheetTop = ROOT - HEIGHT;
    expect(s.machine.wantsDrag(0, 20, sheetTop + 20)).toBe(true);
    expect(s.machine.wantsDrag(0, 20, sheetTop + SHEET_TOP_DRAG_ZONE + 10)).toBe(false); // slider
  });

  it('short pull: follows the finger and springs back with the release speed', () => {
    const s = setup();
    open(s);
    s.machine.dragStart();
    expect(s.machine.currentPhase).toBe('dragging');
    s.machine.dragMove(50);
    s.machine.dragMove(80);
    expect(s.driver.sets.slice(-2)).toEqual([50, 80]);
    s.machine.dragEnd(80, 0.1);
    expect(s.onClose).not.toHaveBeenCalled();
    expect(s.machine.currentPhase).toBe('settling');
    expect(s.driver.last).toMatchObject({ to: 0, animation: { type: 'spring', velocity: 0.1 } });
    s.driver.last.done(true);
    expect(s.machine.currentPhase).toBe('open');
  });

  it('pulled far: closes from where the finger let go and asks the screen to close', () => {
    const s = setup();
    open(s);
    s.machine.dragStart();
    s.machine.dragMove(150);
    s.machine.dragEnd(150, 0.2);
    expect(s.onClose).toHaveBeenCalledTimes(1);
    expect(s.machine.currentPhase).toBe('closing');
    expect(s.driver.last.to).toBe(HEIGHT);
    expect(s.driver.last.animation).toEqual({ type: 'timing', duration: closeDuration(HEIGHT - 150, 0.2) });
    s.machine.dragMove(170); // late move events are ignored
    expect(s.driver.sets[s.driver.sets.length - 1]).toBe(150);
  });

  it('flick: closes fast', () => {
    const s = setup();
    open(s);
    s.machine.dragStart();
    s.machine.dragMove(40);
    s.machine.dragEnd(40, 3);
    expect(s.onClose).toHaveBeenCalledTimes(1);
    const duration = closeDuration(HEIGHT - 40, 3); // 2.25 × 360 pt / 3 pt/ms = 270 ms
    expect(duration).toBe(270);
    expect(s.driver.last.animation).toEqual({ type: 'timing', duration });
  });

  it('pulled up: rubber band, then back', () => {
    const s = setup();
    open(s);
    s.machine.dragStart();
    s.machine.dragMove(-200);
    const v = s.driver.sets[s.driver.sets.length - 1];
    expect(v).toBeLessThan(0);
    expect(v).toBeGreaterThan(-SHEET_RUBBER_LIMIT);
    s.machine.dragEnd(-200, -0.5);
    expect(s.onClose).not.toHaveBeenCalled();
    expect(s.driver.last.to).toBe(0);
  });

  it('gesture taken away: springs back', () => {
    const s = setup();
    open(s);
    s.machine.dragStart();
    s.machine.dragMove(100);
    s.machine.dragCancel();
    expect(s.machine.currentPhase).toBe('settling');
    expect(s.onClose).not.toHaveBeenCalled();
  });

  it('reopened while gliding out: turns around without jumping', () => {
    const s = setup();
    open(s);
    s.machine.setVisible(false);
    const closing = s.driver.last;
    const setsBefore = s.driver.sets.length;
    s.machine.setVisible(true);
    expect(s.driver.sets).toHaveLength(setsBefore); // continues from the current position
    expect(s.driver.last).toMatchObject({ to: 0, animation: { type: 'spring' } });
    closing.done(false); // the stopped close animation reports back
    closing.done(true); // even a late "finished" of the old animation changes nothing
    expect(s.driver.presents).toEqual([true]);
    s.driver.last.done(true);
    expect(s.machine.currentPhase).toBe('open');
  });

  it('closed before the layout arrived: hides at once and still reports onDismiss', () => {
    const s = setup();
    s.machine.setVisible(true);
    s.machine.setVisible(false);
    expect(s.driver.presents).toEqual([true, false]);
    expect(s.driver.animations).toHaveLength(0);
    s.machine.nativeDismissed();
    expect(s.onDismiss).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('opened again before the old dismissal arrived: no onDismiss for the old close', () => {
    const s = setup();
    open(s);
    s.machine.setVisible(false);
    s.driver.last.done(true);
    s.machine.setVisible(true); // content still mounted → opens with the known height
    expect(s.driver.last).toMatchObject({ to: 0 });
    expect(s.driver.sets[s.driver.sets.length - 1]).toBe(HEIGHT);
    jest.advanceTimersByTime(SHEET_DISMISS_FALLBACK_MS);
    expect(s.onDismiss).not.toHaveBeenCalled();
  });

  it('next opening waits for the new layout (content may have changed)', () => {
    const s = setup();
    open(s);
    s.machine.setVisible(false);
    s.driver.last.done(true);
    s.machine.nativeDismissed();
    const count = s.driver.animations.length;
    s.machine.setVisible(true);
    expect(s.machine.currentPhase).toBe('waiting');
    expect(s.driver.animations).toHaveLength(count);
    s.machine.layoutSheet(520); // e.g. one more folder in the list
    expect(s.driver.sets[s.driver.sets.length - 1]).toBe(520);
    s.driver.last.done(true);
    s.machine.setVisible(false);
    expect(s.driver.last.to).toBe(520);
  });

  it('dispose: no timers, no late onDismiss', () => {
    const s = setup();
    open(s);
    s.machine.setVisible(false);
    s.driver.last.done(true);
    s.machine.dispose();
    expect(jest.getTimerCount()).toBe(0);
    s.machine.nativeDismissed();
    expect(s.onDismiss).not.toHaveBeenCalled();
  });
});

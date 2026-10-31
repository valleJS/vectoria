import type { Container, PointData } from 'pixi.js';

const DRAG_THRESHOLD_PX = 5;
const WHEEL_ZOOM_SPEED = 0.0015;

export interface CameraOptions {
  minZoom?: number;
  maxZoom?: number;
  /** Fired on a press/release without dragging, with the point in world coordinates. */
  onClick?: (world: PointData) => void;
  onZoomChange?: (zoom: number) => void;
}

/**
 * Pan/zoom controller for a world container: drag to pan, wheel or pinch to zoom around the
 * cursor. Listens to DOM events on the canvas so Pixi's own event system stays free for entities.
 */
export class Camera {
  private readonly canvas: HTMLCanvasElement;
  private readonly world: Container;
  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly onClick: CameraOptions['onClick'];
  private readonly onZoomChange: CameraOptions['onZoomChange'];

  private readonly pointers = new Map<number, PointData>();
  private downAt: PointData = { x: 0, y: 0 };
  /** True once the current gesture has moved or used multiple pointers, so it can't be a click. */
  private gestureMoved = false;

  constructor(canvas: HTMLCanvasElement, world: Container, options: CameraOptions = {}) {
    this.canvas = canvas;
    this.world = world;
    this.minZoom = options.minZoom ?? 0.25;
    this.maxZoom = options.maxZoom ?? 4;
    this.onClick = options.onClick;
    this.onZoomChange = options.onZoomChange;

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerCancel);
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  get zoom(): number {
    return this.world.scale.x;
  }

  screenToWorld(screen: PointData): PointData {
    return {
      x: (screen.x - this.world.x) / this.zoom,
      y: (screen.y - this.world.y) / this.zoom,
    };
  }

  panBy(dx: number, dy: number): void {
    this.world.x += dx;
    this.world.y += dy;
  }

  /** Multiplies zoom by `factor`, keeping the world point under `screen` fixed. */
  zoomAt(screen: PointData, factor: number): void {
    const next = this.clampZoom(this.zoom * factor);
    if (next === this.zoom) return;
    const anchor = this.screenToWorld(screen);
    this.world.scale.set(next);
    this.world.position.set(screen.x - anchor.x * next, screen.y - anchor.y * next);
    this.onZoomChange?.(next);
  }

  /**
   * Centres a world-space rectangle at the largest zoom that fits it inside the viewport minus
   * `insets` (screen px covered by overlays).
   */
  fit(
    width: number,
    height: number,
    viewWidth: number,
    viewHeight: number,
    padding = 32,
    insets = { top: 0, right: 0, bottom: 0, left: 0 },
  ): void {
    const areaWidth = viewWidth - insets.left - insets.right;
    const areaHeight = viewHeight - insets.top - insets.bottom;
    const zoom = this.clampZoom(
      Math.min((areaWidth - padding * 2) / width, (areaHeight - padding * 2) / height),
    );
    this.world.scale.set(zoom);
    this.world.position.set(
      insets.left + (areaWidth - width * zoom) / 2,
      insets.top + (areaHeight - height * zoom) / 2,
    );
    this.onZoomChange?.(zoom);
  }

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerCancel);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  private clampZoom(zoom: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
  }

  private toLocal(event: MouseEvent): PointData {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /** Midpoint and spread of the first two active pointers, for pinch gestures. */
  private pinch(): { center: PointData; distance: number } | null {
    const [a, b] = this.pointers.values();
    if (!a || !b) return null;
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    // Left button or middle button for mouse; any touch/pen contact.
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;
    this.canvas.setPointerCapture(event.pointerId);
    const point = this.toLocal(event);
    if (this.pointers.size === 0) {
      this.downAt = point;
      this.gestureMoved = false;
    } else {
      this.gestureMoved = true;
    }
    this.pointers.set(event.pointerId, point);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId);
    if (!previous) return;
    const point = this.toLocal(event);

    if (this.pointers.size === 1) {
      if (!this.gestureMoved) {
        // Hold the pan until the pointer clears the threshold, then catch up in one step.
        if (Math.hypot(point.x - this.downAt.x, point.y - this.downAt.y) < DRAG_THRESHOLD_PX) {
          return;
        }
        this.gestureMoved = true;
      }
      this.panBy(point.x - previous.x, point.y - previous.y);
      this.pointers.set(event.pointerId, point);
      return;
    }

    const before = this.pinch();
    this.pointers.set(event.pointerId, point);
    const after = this.pinch();
    if (!before || !after || before.distance === 0) return;
    this.panBy(after.center.x - before.center.x, after.center.y - before.center.y);
    this.zoomAt(after.center, after.distance / before.distance);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    const isClick = this.pointers.size === 1 && !this.gestureMoved;
    this.pointers.delete(event.pointerId);
    if (isClick) this.onClick?.(this.screenToWorld(this.toLocal(event)));
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // deltaMode 1 = lines (Firefox mouse wheels); scale to roughly match pixel deltas.
    const delta = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY;
    this.zoomAt(this.toLocal(event), Math.exp(-delta * WHEEL_ZOOM_SPEED));
  };
}

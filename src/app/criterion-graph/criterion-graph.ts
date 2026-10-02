import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { MAX_VALUE, MIN_VALUE } from '../models';
import { RankingService } from '../ranking.service';

const BASE_WIDTH = 500;
const VIEWBOX_HEIGHT = 480;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 30;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 40;
/** Minimum horizontal room per object; below this, labels start to crowd even when staggered. */
const MIN_LANE_WIDTH = 70;
/** Vertical distance from the point to its label, alternating per lane to avoid overlap. */
const LABEL_OFFSETS = [14, 28];

@Component({
  selector: 'app-criterion-graph',
  imports: [],
  templateUrl: './criterion-graph.html',
  styleUrl: './criterion-graph.css',
})
export class CriterionGraph {
  protected readonly ranking = inject(RankingService);

  protected readonly viewboxHeight = VIEWBOX_HEIGHT;
  protected readonly axisX = MARGIN_LEFT;
  protected readonly axisTopY = MARGIN_TOP;
  protected readonly axisBottomY = VIEWBOX_HEIGHT - MARGIN_BOTTOM;
  protected readonly ticks = Array.from(
    { length: MAX_VALUE - MIN_VALUE + 1 },
    (_, i) => MIN_VALUE + i,
  );

  /** Widens the chart once there are too many objects to label comfortably at the base width. */
  protected readonly viewboxWidth = computed(() => {
    const count = this.ranking.objects().length;
    const needed = MARGIN_LEFT + MARGIN_RIGHT + count * MIN_LANE_WIDTH;
    return Math.max(BASE_WIDTH, needed);
  });

  protected readonly plotRight = computed(() => this.viewboxWidth() - 10);

  protected readonly criterion = computed(() => {
    const id = this.ranking.selectedCriteriaIds()[0];
    return this.ranking.criteria().find((c) => c.id === id) ?? null;
  });

  /** Gradient runs from the "worst" end of the axis to the "best" end. */
  protected readonly gradientY = computed(() => {
    const c = this.criterion();
    const worstIsBottom = c?.higherIsBetter ?? true;
    return worstIsBottom
      ? { y1: this.axisBottomY, y2: this.axisTopY }
      : { y1: this.axisTopY, y2: this.axisBottomY };
  });

  protected readonly points = computed(() => {
    const criterion = this.criterion();
    const objects = this.ranking.objects();
    if (!criterion) return [];
    const plotWidth = this.viewboxWidth() - MARGIN_LEFT - MARGIN_RIGHT;
    const laneCount = objects.length + 1;
    return objects.map((obj, i) => {
      const value = obj.values[criterion.id] ?? 5;
      return {
        id: obj.id,
        name: obj.name,
        value,
        x: MARGIN_LEFT + ((i + 1) * plotWidth) / laneCount,
        y: this.valueToY(value),
        labelOffset: LABEL_OFFSETS[i % LABEL_OFFSETS.length],
      };
    });
  });

  protected readonly draggingId = signal<string | null>(null);

  private valueToY(value: number): number {
    const frac = (value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE);
    return this.axisBottomY - frac * (this.axisBottomY - this.axisTopY);
  }

  private yToValue(y: number): number {
    const frac = (this.axisBottomY - y) / (this.axisBottomY - this.axisTopY);
    const raw = MIN_VALUE + frac * (MAX_VALUE - MIN_VALUE);
    return Math.min(MAX_VALUE, Math.max(MIN_VALUE, Math.round(raw)));
  }

  /** Capture is taken on the <svg> root — see the equivalent note in XyGraph for why. */
  protected onPointerDown(event: PointerEvent, objectId: string): void {
    const svg = (event.currentTarget as SVGElement).ownerSVGElement;
    try {
      svg?.setPointerCapture(event.pointerId);
    } catch {
      // Pointer already released (e.g. a stray/synthetic event) — safe to ignore.
    }
    this.draggingId.set(objectId);
    this.updateFromPointer(event);
    event.preventDefault();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.draggingId() === null) return;
    this.updateFromPointer(event);
  }

  protected onPointerUp(event: PointerEvent): void {
    const svg = event.currentTarget as SVGElement;
    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    this.draggingId.set(null);
  }

  /**
   * Safety net: if a pointerup/cancel is ever missed by the dragged element itself
   * (e.g. the element was repositioned mid-drag), this guarantees the drag still ends.
   */
  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  protected forceEndDrag(): void {
    this.draggingId.set(null);
  }

  private updateFromPointer(event: PointerEvent): void {
    const criterion = this.criterion();
    const objectId = this.draggingId();
    if (!criterion || !objectId) return;
    const target = event.currentTarget as SVGElement;
    const svg = target instanceof SVGSVGElement ? target : target.ownerSVGElement;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = point.matrixTransform(ctm.inverse());
    const value = this.yToValue(local.y);
    this.ranking.setValue(objectId, criterion.id, value);
  }
}

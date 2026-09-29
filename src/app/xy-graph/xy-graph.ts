import { Component, computed, inject, signal } from '@angular/core';
import { MAX_VALUE, MIN_VALUE } from '../models';
import { RankingService } from '../ranking.service';

const VIEWBOX_SIZE = 520;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 60;
const MARGIN_LEFT = 60;
const MARGIN_RIGHT = 30;

@Component({
  selector: 'app-xy-graph',
  imports: [],
  templateUrl: './xy-graph.html',
  styleUrl: './xy-graph.css',
})
export class XyGraph {
  protected readonly ranking = inject(RankingService);

  protected readonly viewboxSize = VIEWBOX_SIZE;
  protected readonly axisLeftX = MARGIN_LEFT;
  protected readonly axisRightX = VIEWBOX_SIZE - MARGIN_RIGHT;
  protected readonly axisTopY = MARGIN_TOP;
  protected readonly axisBottomY = VIEWBOX_SIZE - MARGIN_BOTTOM;
  protected readonly ticks = Array.from(
    { length: MAX_VALUE - MIN_VALUE + 1 },
    (_, i) => MIN_VALUE + i,
  );

  private readonly xCriterion = computed(() => {
    const id = this.ranking.selectedCriteriaIds()[0];
    return this.ranking.criteria().find((c) => c.id === id) ?? null;
  });

  private readonly yCriterion = computed(() => {
    const id = this.ranking.selectedCriteriaIds()[1];
    return this.ranking.criteria().find((c) => c.id === id) ?? null;
  });

  protected readonly axes = computed(() => {
    const xc = this.xCriterion();
    const yc = this.yCriterion();
    return xc && yc ? { xc, yc } : null;
  });

  protected readonly points = computed(() => {
    const xc = this.xCriterion();
    const yc = this.yCriterion();
    if (!xc || !yc) return [];
    return this.ranking.objects().map((obj) => {
      const xValue = obj.values[xc.id] ?? 5;
      const yValue = obj.values[yc.id] ?? 5;
      return {
        id: obj.id,
        name: obj.name,
        xValue,
        yValue,
        x: this.valueToX(xValue),
        y: this.valueToY(yValue),
      };
    });
  });

  protected readonly draggingId = signal<string | null>(null);

  private valueToX(value: number): number {
    const frac = (value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE);
    return this.axisLeftX + frac * (this.axisRightX - this.axisLeftX);
  }

  private valueToY(value: number): number {
    const frac = (value - MIN_VALUE) / (MAX_VALUE - MIN_VALUE);
    return this.axisBottomY - frac * (this.axisBottomY - this.axisTopY);
  }

  private xToValue(x: number): number {
    const frac = (x - this.axisLeftX) / (this.axisRightX - this.axisLeftX);
    const raw = MIN_VALUE + frac * (MAX_VALUE - MIN_VALUE);
    return Math.min(MAX_VALUE, Math.max(MIN_VALUE, Math.round(raw)));
  }

  private yToValue(y: number): number {
    const frac = (this.axisBottomY - y) / (this.axisBottomY - this.axisTopY);
    const raw = MIN_VALUE + frac * (MAX_VALUE - MIN_VALUE);
    return Math.min(MAX_VALUE, Math.max(MIN_VALUE, Math.round(raw)));
  }

  protected onPointerDown(event: PointerEvent, objectId: string): void {
    const target = event.currentTarget as SVGElement;
    target.setPointerCapture(event.pointerId);
    this.draggingId.set(objectId);
    this.updateFromPointer(event);
    event.preventDefault();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.draggingId() === null) return;
    this.updateFromPointer(event);
  }

  protected onPointerUp(event: PointerEvent): void {
    const target = event.currentTarget as SVGElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    this.draggingId.set(null);
  }

  private updateFromPointer(event: PointerEvent): void {
    const xc = this.xCriterion();
    const yc = this.yCriterion();
    const objectId = this.draggingId();
    if (!xc || !yc || !objectId) return;
    const svg = (event.currentTarget as SVGElement).ownerSVGElement;
    if (!svg) return;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const local = point.matrixTransform(ctm.inverse());
    const xValue = this.xToValue(local.x);
    const yValue = this.yToValue(local.y);
    this.ranking.setValue(objectId, xc.id, xValue);
    this.ranking.setValue(objectId, yc.id, yValue);
  }
}

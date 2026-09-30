import { Component, computed, inject, signal } from '@angular/core';
import { MAX_VALUE, MIN_VALUE } from '../models';
import { RankingService } from '../ranking.service';

const VIEWBOX_SIZE = 520;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 60;
const MARGIN_LEFT = 60;
const MARGIN_RIGHT = 30;

/** Points whose raw positions fall within this distance are treated as overlapping. */
const JITTER_THRESHOLD = 16;

interface RawPoint {
  x: number;
  y: number;
}

/** Groups points into clusters of mutually-nearby positions (chained, not just pairwise). */
function clusterByProximity<T extends RawPoint>(items: T[], threshold: number): T[][] {
  const clusters: T[][] = [];
  const visited = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;
    const cluster = [items[i]];
    visited.add(i);
    let frontier = [i];
    while (frontier.length > 0) {
      const next: number[] = [];
      for (const idx of frontier) {
        for (let j = 0; j < items.length; j++) {
          if (visited.has(j)) continue;
          const dx = items[idx].x - items[j].x;
          const dy = items[idx].y - items[j].y;
          if (Math.sqrt(dx * dx + dy * dy) <= threshold) {
            visited.add(j);
            cluster.push(items[j]);
            next.push(j);
          }
        }
      }
      frontier = next;
    }
    clusters.push(cluster);
  }
  return clusters;
}

/** Spreads overlapping points evenly around their shared centroid so each stays clickable. */
function jitterCluster<T extends RawPoint>(cluster: T[]): (T & RawPoint)[] {
  if (cluster.length === 1) return cluster;
  const centroid = {
    x: cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length,
    y: cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length,
  };
  const radius = Math.max(14, 4 * cluster.length);
  return cluster.map((p, i) => {
    const angle = (2 * Math.PI * i) / cluster.length - Math.PI / 2;
    return {
      ...p,
      x: centroid.x + radius * Math.cos(angle),
      y: centroid.y + radius * Math.sin(angle),
    };
  });
}

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

  /** Diagonal gradient from the "worst" corner (both criteria at their worst) to the "best" corner. */
  protected readonly gradientCorners = computed(() => {
    const xc = this.xCriterion();
    const yc = this.yCriterion();
    const xHigherIsBetter = xc?.higherIsBetter ?? true;
    const yHigherIsBetter = yc?.higherIsBetter ?? true;
    const worstX = xHigherIsBetter ? this.axisLeftX : this.axisRightX;
    const bestX = xHigherIsBetter ? this.axisRightX : this.axisLeftX;
    const worstY = yHigherIsBetter ? this.axisBottomY : this.axisTopY;
    const bestY = yHigherIsBetter ? this.axisTopY : this.axisBottomY;
    return { x1: worstX, y1: worstY, x2: bestX, y2: bestY };
  });

  protected readonly points = computed(() => {
    const xc = this.xCriterion();
    const yc = this.yCriterion();
    if (!xc || !yc) return [];
    const rawPoints = this.ranking.objects().map((obj) => {
      const xValue = obj.values[xc.id] ?? 5;
      const yValue = obj.values[yc.id] ?? 5;
      const x = this.valueToX(xValue);
      const y = this.valueToY(yValue);
      return { id: obj.id, name: obj.name, xValue, yValue, x, y, rawX: x, rawY: y };
    });
    return clusterByProximity(rawPoints, JITTER_THRESHOLD).flatMap(jitterCluster);
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

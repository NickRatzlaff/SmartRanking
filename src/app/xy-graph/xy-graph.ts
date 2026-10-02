import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { MAX_VALUE, MIN_VALUE } from '../models';
import { RankingService } from '../ranking.service';

const VIEWBOX_SIZE = 520;
const MARGIN_TOP = 30;
const MARGIN_BOTTOM = 60;
const MARGIN_LEFT = 60;
const MARGIN_RIGHT = 30;

interface GroupMember {
  id: string;
  name: string;
  xValue: number;
  yValue: number;
}

interface PointGroup {
  key: string;
  x: number;
  y: number;
  members: GroupMember[];
}

interface JitteredPoint extends GroupMember {
  x: number;
  y: number;
}

/** Radius of the small cluster each overlapping group's points are spread around. */
function clusterRadius(memberCount: number): number {
  return Math.max(16, 5 * memberCount);
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

  /** Objects grouped by their exact (x, y) value pair — anyone sharing a spot lands in the same group. */
  protected readonly groups = computed<PointGroup[]>(() => {
    const xc = this.xCriterion();
    const yc = this.yCriterion();
    if (!xc || !yc) return [];
    const byKey = new Map<string, PointGroup>();
    for (const obj of this.ranking.objects()) {
      const xValue = obj.values[xc.id] ?? 5;
      const yValue = obj.values[yc.id] ?? 5;
      const key = `${xValue},${yValue}`;
      let group = byKey.get(key);
      if (!group) {
        group = { key, x: this.valueToX(xValue), y: this.valueToY(yValue), members: [] };
        byKey.set(key, group);
      }
      group.members.push({ id: obj.id, name: obj.name, xValue, yValue });
    }
    return [...byKey.values()];
  });

  /** Group currently expanded into individual, draggable points — via hover, or while a member is being dragged. */
  protected readonly activeGroupKey = signal<string | null>(null);
  protected readonly hoveredSingleId = signal<string | null>(null);
  protected readonly draggingId = signal<string | null>(null);

  protected readonly expandedPoints = computed<JitteredPoint[]>(() => {
    const group = this.groups().find((g) => g.key === this.activeGroupKey());
    if (!group) return [];
    const { members, x: centerX, y: centerY } = group;
    if (members.length === 1) {
      return [{ ...members[0], x: centerX, y: centerY }];
    }
    const radius = clusterRadius(members.length);
    return members.map((m, i) => {
      const angle = (2 * Math.PI * i) / members.length - Math.PI / 2;
      return { ...m, x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) };
    });
  });

  protected clusterHoverRadius(memberCount: number): number {
    return clusterRadius(memberCount) + 12;
  }

  protected expandGroup(key: string): void {
    this.activeGroupKey.set(key);
  }

  protected collapseGroup(key: string): void {
    if (this.draggingId() !== null) return; // keep expanded while a member is actively being dragged
    if (this.activeGroupKey() === key) {
      this.activeGroupKey.set(null);
    }
  }

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
    try {
      target.setPointerCapture(event.pointerId);
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
    const target = event.currentTarget as SVGElement;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    this.draggingId.set(null);
    this.activeGroupKey.set(null);
  }

  /**
   * Safety net: if a pointerup/cancel is ever missed by the dragged element itself
   * (e.g. the element was repositioned mid-drag), this guarantees the drag still ends.
   */
  @HostListener('window:pointerup')
  @HostListener('window:pointercancel')
  protected forceEndDrag(): void {
    this.draggingId.set(null);
    this.activeGroupKey.set(null);
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

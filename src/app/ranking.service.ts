import { Injectable, computed, effect, signal } from '@angular/core';
import { Criterion, DEFAULT_VALUE, MAX_VALUE, MIN_VALUE, RankedObject } from './models';

const STORAGE_KEY = 'smart-ranking-state';

export interface ScoredObject extends RankedObject {
  score: number;
}

interface PersistedState {
  criteria: Criterion[];
  objects: RankedObject[];
}

function createId(): string {
  return crypto.randomUUID();
}

@Injectable({ providedIn: 'root' })
export class RankingService {
  readonly criteria = signal<Criterion[]>([]);
  readonly objects = signal<RankedObject[]>([]);

  /** Criteria currently checked for graph view (0, 1, or 2). */
  readonly selectedCriteriaIds = signal<string[]>([]);

  readonly totalWeight = computed(() => this.criteria().reduce((sum, c) => sum + c.weight, 0));

  /** True while a value or weight slider is actively being dragged. */
  readonly isAdjusting = signal(false);

  private readonly frozenOrderIds = signal<string[]>([]);

  private readonly objectScores = computed<ScoredObject[]>(() => {
    const criteria = this.criteria();
    const total = this.totalWeight();
    return this.objects().map((obj) => {
      const score =
        total <= 0
          ? 0
          : criteria.reduce((sum, c) => {
              const value = obj.values[c.id] ?? DEFAULT_VALUE;
              const effective = c.higherIsBetter ? value : MIN_VALUE + MAX_VALUE - value;
              return sum + (effective * c.weight) / total;
            }, 0);
      return { ...obj, score };
    });
  });

  /**
   * Sorted by score, but while isAdjusting is true the row order is frozen to
   * whatever it was when the drag began — otherwise rows swap position under
   * the pointer on every tick, making unrelated sliders look like they moved.
   */
  readonly scoredObjects = computed<ScoredObject[]>(() => {
    const scored = this.objectScores();
    const byId = new Map(scored.map((o) => [o.id, o]));
    const sortedIds = [...scored].sort((a, b) => b.score - a.score).map((o) => o.id);
    const orderIds = this.isAdjusting() ? this.frozenOrderIds() : sortedIds;
    const known = orderIds.filter((id) => byId.has(id));
    const missing = sortedIds.filter((id) => !known.includes(id));
    return [...known, ...missing].map((id) => byId.get(id)!);
  });

  /** Call when a slider drag starts, to freeze row order until endAdjust(). */
  beginAdjust(): void {
    if (this.isAdjusting()) return;
    this.frozenOrderIds.set(this.scoredObjects().map((o) => o.id));
    this.isAdjusting.set(true);
  }

  endAdjust(): void {
    this.isAdjusting.set(false);
  }

  constructor() {
    this.load();
    effect(() => {
      const state: PersistedState = { criteria: this.criteria(), objects: this.objects() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }

  private load(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed: PersistedState = JSON.parse(raw);
      this.criteria.set(
        (parsed.criteria ?? []).map((c) => ({ ...c, higherIsBetter: c.higherIsBetter ?? true })),
      );
      this.objects.set(parsed.objects ?? []);
    } catch {
      // ignore corrupt state
    }
  }

  addCriterion(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.criteria.update((list) => [
      ...list,
      { id: createId(), name: trimmed, weight: 50, higherIsBetter: true },
    ]);
  }

  toggleCriterionDirection(id: string): void {
    this.criteria.update((list) =>
      list.map((c) => (c.id === id ? { ...c, higherIsBetter: !c.higherIsBetter } : c)),
    );
  }

  removeCriterion(id: string): void {
    this.criteria.update((list) => list.filter((c) => c.id !== id));
    this.selectedCriteriaIds.update((ids) => ids.filter((cid) => cid !== id));
    this.objects.update((list) =>
      list.map((obj) => {
        const { [id]: _removed, ...rest } = obj.values;
        return { ...obj, values: rest };
      }),
    );
  }

  renameCriterion(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.criteria.update((list) => list.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
  }

  setWeight(id: string, weight: number): void {
    this.criteria.update((list) => list.map((c) => (c.id === id ? { ...c, weight } : c)));
  }

  toggleCriterionSelected(id: string): void {
    this.selectedCriteriaIds.update((ids) => {
      if (ids.includes(id)) {
        return ids.filter((cid) => cid !== id);
      }
      if (ids.length >= 2) {
        return ids; // already at max, ignore
      }
      return [...ids, id];
    });
  }

  addObject(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    const values: Record<string, number> = {};
    for (const c of this.criteria()) {
      values[c.id] = DEFAULT_VALUE;
    }
    this.objects.update((list) => [...list, { id: createId(), name: trimmed, values }]);
  }

  removeObject(id: string): void {
    this.objects.update((list) => list.filter((o) => o.id !== id));
  }

  renameObject(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.objects.update((list) => list.map((o) => (o.id === id ? { ...o, name: trimmed } : o)));
  }

  setValue(objectId: string, criterionId: string, value: number): void {
    const clamped = Math.min(MAX_VALUE, Math.max(MIN_VALUE, value));
    this.objects.update((list) =>
      list.map((o) =>
        o.id === objectId ? { ...o, values: { ...o.values, [criterionId]: clamped } } : o,
      ),
    );
  }
}

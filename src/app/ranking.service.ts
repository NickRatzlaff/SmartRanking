import { Injectable, computed, effect, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Criterion, DEFAULT_VALUE, MAX_VALUE, MIN_VALUE, RankedObject, ThemeName } from './models';
import { supabase } from './supabase.client';

export interface ScoredObject extends RankedObject {
  score: number;
}

/** How long to wait after the last rapid-fire change (slider drag) before writing it. */
const WRITE_DEBOUNCE_MS = 400;
/** How long to coalesce incoming realtime events before refetching the board. */
const REFETCH_DEBOUNCE_MS = 200;

function createId(): string {
  return crypto.randomUUID();
}

function logIfError(error: { message: string } | null): void {
  if (error) console.error('Supabase write failed:', error.message);
}

@Injectable({ providedIn: 'root' })
export class RankingService {
  readonly criteria = signal<Criterion[]>([]);
  readonly objects = signal<RankedObject[]>([]);

  /** Criteria currently checked for graph view (0, 1, or 2) — local to this viewer, not synced. */
  readonly selectedCriteriaIds = signal<string[]>([]);

  /** True while the initial fetch for the current board is in flight. */
  readonly loading = signal(true);

  /** The connected board's theme — synced via Supabase so a shared link opens pre-themed. */
  readonly theme = signal<ThemeName>('default');

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

  private boardId: string | null = null;
  private channel: RealtimeChannel | null = null;
  private readonly pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();
  private refetchTimer: ReturnType<typeof setTimeout> | null = null;
  private refetchDeferred = false;

  constructor() {
    // Applies live regardless of source: our own selection, the initial fetch, or a
    // realtime update from a collaborator who changed it on their end.
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });
  }

  /** Call when a slider drag starts, to freeze row order until endAdjust(). */
  beginAdjust(): void {
    if (this.isAdjusting()) return;
    this.frozenOrderIds.set(this.scoredObjects().map((o) => o.id));
    this.isAdjusting.set(true);
  }

  endAdjust(): void {
    this.isAdjusting.set(false);
    if (this.refetchDeferred) {
      this.refetchDeferred = false;
      // Longer than REFETCH_DEBOUNCE_MS on purpose: this gesture's own debounced write
      // (WRITE_DEBOUNCE_MS after its last input, which just happened) hasn't landed yet.
      // Catching up at the normal short delay would race ahead of it and refetch the
      // pre-write value, reverting what was just typed/dragged right back.
      this.scheduleRefetch(WRITE_DEBOUNCE_MS + 100);
    }
  }

  /** Loads a board and subscribes to live changes from other collaborators. */
  async connect(boardId: string): Promise<void> {
    this.disconnect();
    this.boardId = boardId;
    this.loading.set(true);
    this.criteria.set([]);
    this.objects.set([]);
    this.theme.set('default');

    await this.refetchAll();
    this.loading.set(false);

    this.channel = supabase
      .channel(`board-${boardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
        () => this.scheduleRefetch(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'criteria', filter: `board_id=eq.${boardId}` },
        () => this.scheduleRefetch(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ranked_objects',
          filter: `board_id=eq.${boardId}`,
        },
        () => this.scheduleRefetch(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'object_values',
          filter: `board_id=eq.${boardId}`,
        },
        () => this.scheduleRefetch(),
      )
      .subscribe();
  }

  /** Unsubscribes from the current board and cancels any pending debounced writes. */
  disconnect(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
    for (const timer of this.pendingWrites.values()) clearTimeout(timer);
    this.pendingWrites.clear();
    if (this.refetchTimer) {
      clearTimeout(this.refetchTimer);
      this.refetchTimer = null;
    }
    this.boardId = null;
  }

  private scheduleRefetch(delayMs = REFETCH_DEBOUNCE_MS): void {
    // Don't yank the board out from under an in-progress local drag; catch up once it ends.
    if (this.isAdjusting()) {
      this.refetchDeferred = true;
      return;
    }
    if (this.refetchTimer) clearTimeout(this.refetchTimer);
    this.refetchTimer = setTimeout(() => {
      this.refetchTimer = null;
      // Re-check: a drag/edit may have started in the gap between scheduling and firing.
      if (this.isAdjusting()) {
        this.refetchDeferred = true;
        return;
      }
      this.refetchAll();
    }, delayMs);
  }

  private async refetchAll(): Promise<void> {
    const boardId = this.boardId;
    if (!boardId) return;
    const [{ data: boardRow }, { data: criteriaRows }, { data: objectRows }, { data: valueRows }] =
      await Promise.all([
        supabase.from('boards').select('theme').eq('id', boardId).maybeSingle(),
        supabase.from('criteria').select('*').eq('board_id', boardId).order('created_at'),
        supabase.from('ranked_objects').select('*').eq('board_id', boardId).order('created_at'),
        supabase.from('object_values').select('*').eq('board_id', boardId),
      ]);
    if (this.boardId !== boardId) return; // a newer connect() superseded this fetch

    this.theme.set((boardRow?.['theme'] as ThemeName | undefined) ?? 'default');

    this.criteria.set(
      (criteriaRows ?? []).map((r) => ({
        id: r['id'],
        name: r['name'],
        weight: r['weight'],
        higherIsBetter: r['higher_is_better'],
      })),
    );

    const valuesByObject = new Map<string, Record<string, number>>();
    for (const v of valueRows ?? []) {
      const values = valuesByObject.get(v['object_id']) ?? {};
      values[v['criterion_id']] = Number(v['value']);
      valuesByObject.set(v['object_id'], values);
    }
    this.objects.set(
      (objectRows ?? []).map((r) => ({
        id: r['id'],
        name: r['name'],
        values: valuesByObject.get(r['id']) ?? {},
        notes: r['notes'] ?? '',
      })),
    );
  }

  private debounceWrite(key: string, fn: () => void): void {
    const existing = this.pendingWrites.get(key);
    if (existing) clearTimeout(existing);
    this.pendingWrites.set(
      key,
      setTimeout(() => {
        this.pendingWrites.delete(key);
        fn();
      }, WRITE_DEBOUNCE_MS),
    );
  }

  addCriterion(name: string): void {
    const trimmed = name.trim();
    if (!trimmed || !this.boardId) return;
    const id = createId();
    const boardId = this.boardId;
    this.criteria.update((list) => [
      ...list,
      { id, name: trimmed, weight: 50, higherIsBetter: true },
    ]);
    supabase
      .from('criteria')
      .insert({ id, board_id: boardId, name: trimmed, weight: 50, higher_is_better: true })
      .then(({ error }) => logIfError(error));
  }

  toggleCriterionDirection(id: string): void {
    let nextValue = true;
    this.criteria.update((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        nextValue = !c.higherIsBetter;
        return { ...c, higherIsBetter: nextValue };
      }),
    );
    if (!this.boardId) return;
    supabase
      .from('criteria')
      .update({ higher_is_better: nextValue })
      .eq('id', id)
      .then(({ error }) => logIfError(error));
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
    if (!this.boardId) return;
    supabase
      .from('criteria')
      .delete()
      .eq('id', id)
      .then(({ error }) => logIfError(error));
  }

  renameCriterion(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.criteria.update((list) => list.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
    if (!this.boardId) return;
    supabase
      .from('criteria')
      .update({ name: trimmed })
      .eq('id', id)
      .then(({ error }) => logIfError(error));
  }

  setWeight(id: string, weight: number): void {
    this.criteria.update((list) => list.map((c) => (c.id === id ? { ...c, weight } : c)));
    if (!this.boardId) return;
    this.debounceWrite(`weight:${id}`, () => {
      supabase
        .from('criteria')
        .update({ weight })
        .eq('id', id)
        .then(({ error }) => logIfError(error));
    });
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
    if (!trimmed || !this.boardId) return;
    const id = createId();
    const boardId = this.boardId;
    const values: Record<string, number> = {};
    for (const c of this.criteria()) {
      values[c.id] = DEFAULT_VALUE;
    }
    this.objects.update((list) => [...list, { id, name: trimmed, values, notes: '' }]);

    supabase
      .from('ranked_objects')
      .insert({ id, board_id: boardId, name: trimmed, notes: '' })
      .then(({ error }) => logIfError(error));

    const valueRows = Object.entries(values).map(([criterionId, value]) => ({
      object_id: id,
      criterion_id: criterionId,
      board_id: boardId,
      value,
    }));
    if (valueRows.length > 0) {
      supabase
        .from('object_values')
        .insert(valueRows)
        .then(({ error }) => logIfError(error));
    }
  }

  removeObject(id: string): void {
    this.objects.update((list) => list.filter((o) => o.id !== id));
    if (!this.boardId) return;
    supabase
      .from('ranked_objects')
      .delete()
      .eq('id', id)
      .then(({ error }) => logIfError(error));
  }

  renameObject(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    this.objects.update((list) => list.map((o) => (o.id === id ? { ...o, name: trimmed } : o)));
    if (!this.boardId) return;
    supabase
      .from('ranked_objects')
      .update({ name: trimmed })
      .eq('id', id)
      .then(({ error }) => logIfError(error));
  }

  setValue(objectId: string, criterionId: string, value: number): void {
    const clamped = Math.min(MAX_VALUE, Math.max(MIN_VALUE, value));
    this.objects.update((list) =>
      list.map((o) =>
        o.id === objectId ? { ...o, values: { ...o.values, [criterionId]: clamped } } : o,
      ),
    );
    if (!this.boardId) return;
    const boardId = this.boardId;
    this.debounceWrite(`value:${objectId}:${criterionId}`, () => {
      supabase
        .from('object_values')
        .upsert(
          { object_id: objectId, criterion_id: criterionId, board_id: boardId, value: clamped },
          { onConflict: 'object_id,criterion_id' },
        )
        .then(({ error }) => logIfError(error));
    });
  }

  setTheme(theme: ThemeName): void {
    this.theme.set(theme);
    if (!this.boardId) return;
    supabase
      .from('boards')
      .update({ theme })
      .eq('id', this.boardId)
      .then(({ error }) => logIfError(error));
  }

  setNotes(objectId: string, notes: string): void {
    this.objects.update((list) =>
      list.map((o) => (o.id === objectId ? { ...o, notes } : o)),
    );
    if (!this.boardId) return;
    this.debounceWrite(`notes:${objectId}`, () => {
      supabase
        .from('ranked_objects')
        .update({ notes })
        .eq('id', objectId)
        .then(({ error }) => logIfError(error));
    });
  }
}

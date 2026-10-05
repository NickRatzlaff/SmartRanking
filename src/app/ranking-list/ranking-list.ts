import { Component, inject, signal } from '@angular/core';
import { MAX_VALUE, MIN_VALUE, RankedObject } from '../models';
import { ObjectEditor } from '../object-editor/object-editor';
import { RankingService } from '../ranking.service';

@Component({
  selector: 'app-ranking-list',
  imports: [ObjectEditor],
  templateUrl: './ranking-list.html',
  styleUrl: './ranking-list.css',
})
export class RankingList {
  protected readonly ranking = inject(RankingService);

  protected readonly showAddObject = signal(false);
  protected readonly editingObject = signal<RankedObject | null>(null);

  private readonly expandedIds = signal<ReadonlySet<string>>(new Set());

  protected isExpanded(id: string): boolean {
    return this.expandedIds().has(id);
  }

  protected toggleExpanded(id: string): void {
    this.expandedIds.update((ids) => {
      const next = new Set(ids);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /** All fields except the primary (first) one — shown only when a row is expanded. */
  protected secondaryFields() {
    return this.ranking.fields().slice(1);
  }

  protected onValueChange(objectId: string, criterionId: string, event: Event): void {
    this.ranking.beginAdjust();
    const input = event.target as HTMLInputElement;
    this.ranking.setValue(objectId, criterionId, Number(input.value));
  }

  protected onValueCommitted(): void {
    this.ranking.endAdjust();
  }

  /** 0-100 fill percentage for the score bar; score is always within [MIN_VALUE, MAX_VALUE]. */
  private scorePercent(score: number): number {
    const pct = ((score - MIN_VALUE) / (MAX_VALUE - MIN_VALUE)) * 100;
    return Math.min(100, Math.max(0, pct));
  }

  /** Bar fill width — floored so the lowest score still shows a sliver of red. */
  protected scoreBarWidth(score: number): number {
    return Math.max(this.scorePercent(score), 4);
  }

  /** Red -> yellow -> green as the score climbs from MIN_VALUE to MAX_VALUE. */
  protected scoreColor(score: number): string {
    const hue = (this.scorePercent(score) / 100) * 120;
    return `hsl(${hue}, 70%, 45%)`;
  }
}

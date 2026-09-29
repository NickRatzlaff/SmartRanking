import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RankingService } from '../ranking.service';

@Component({
  selector: 'app-ranking-list',
  imports: [FormsModule],
  templateUrl: './ranking-list.html',
  styleUrl: './ranking-list.css',
})
export class RankingList {
  protected readonly ranking = inject(RankingService);

  protected newObjectName = '';

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

  protected addObject(): void {
    this.ranking.addObject(this.newObjectName);
    this.newObjectName = '';
  }

  protected onValueChange(objectId: string, criterionId: string, event: Event): void {
    this.ranking.beginAdjust();
    const input = event.target as HTMLInputElement;
    this.ranking.setValue(objectId, criterionId, Number(input.value));
  }

  protected onValueCommitted(): void {
    this.ranking.endAdjust();
  }
}

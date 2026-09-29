import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RankingService } from '../ranking.service';

@Component({
  selector: 'app-criteria-panel',
  imports: [FormsModule],
  templateUrl: './criteria-panel.html',
  styleUrl: './criteria-panel.css',
})
export class CriteriaPanel {
  protected readonly ranking = inject(RankingService);

  protected newCriterionName = '';

  protected addCriterion(): void {
    this.ranking.addCriterion(this.newCriterionName);
    this.newCriterionName = '';
  }

  protected onWeightChange(id: string, event: Event): void {
    this.ranking.beginAdjust();
    const input = event.target as HTMLInputElement;
    this.ranking.setWeight(id, Number(input.value));
  }

  protected onWeightCommitted(): void {
    this.ranking.endAdjust();
  }

  protected isMaxSelected(id: string): boolean {
    const selected = this.ranking.selectedCriteriaIds();
    return selected.length >= 2 && !selected.includes(id);
  }
}

import { Component, inject } from '@angular/core';
import { CriteriaPanel } from './criteria-panel/criteria-panel';
import { CriterionGraph } from './criterion-graph/criterion-graph';
import { RankingList } from './ranking-list/ranking-list';
import { RankingService } from './ranking.service';
import { XyGraph } from './xy-graph/xy-graph';

@Component({
  selector: 'app-root',
  imports: [RankingList, CriteriaPanel, CriterionGraph, XyGraph],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly ranking = inject(RankingService);
}

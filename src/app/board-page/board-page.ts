import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CriteriaPanel } from '../criteria-panel/criteria-panel';
import { CriterionGraph } from '../criterion-graph/criterion-graph';
import { RankingList } from '../ranking-list/ranking-list';
import { RankingService } from '../ranking.service';
import { XyGraph } from '../xy-graph/xy-graph';

@Component({
  selector: 'app-board-page',
  imports: [RankingList, CriteriaPanel, CriterionGraph, XyGraph],
  templateUrl: './board-page.html',
  styleUrl: './board-page.css',
})
export class BoardPage implements OnInit, OnDestroy {
  protected readonly ranking = inject(RankingService);
  private readonly route = inject(ActivatedRoute);

  protected readonly linkCopied = signal(false);

  ngOnInit(): void {
    const boardId = this.route.snapshot.paramMap.get('boardId');
    if (boardId) {
      this.ranking.connect(boardId);
    }
  }

  ngOnDestroy(): void {
    this.ranking.disconnect();
  }

  protected async copyShareLink(): Promise<void> {
    await navigator.clipboard.writeText(window.location.href);
    this.linkCopied.set(true);
    setTimeout(() => this.linkCopied.set(false), 2000);
  }
}

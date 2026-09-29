import { Component } from '@angular/core';
import { CriteriaPanel } from './criteria-panel/criteria-panel';
import { RankingList } from './ranking-list/ranking-list';

@Component({
  selector: 'app-root',
  imports: [RankingList, CriteriaPanel],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {}

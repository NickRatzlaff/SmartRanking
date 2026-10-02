import { Routes } from '@angular/router';
import { BoardPage } from './board-page/board-page';
import { NewBoard } from './new-board/new-board';

export const routes: Routes = [
  { path: '', component: NewBoard },
  { path: 'board/:boardId', component: BoardPage },
];

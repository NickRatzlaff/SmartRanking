import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppHeader } from '../app-header/app-header';
import { BoardService } from '../board.service';

@Component({
  selector: 'app-new-board',
  imports: [AppHeader],
  templateUrl: './new-board.html',
  styleUrl: './new-board.css',
})
export class NewBoard implements OnInit {
  private readonly boardService = inject(BoardService);
  private readonly router = inject(Router);

  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const id = await this.boardService.createBoard();
      this.router.navigate(['/board', id]);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to create a board.');
    }
  }
}

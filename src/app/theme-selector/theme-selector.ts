import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { ThemeName } from '../models';
import { RankingService } from '../ranking.service';

interface ThemeOption {
  value: ThemeName;
  label: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'default', label: 'Default' },
  { value: 'qhs', label: 'QHS' },
];

@Component({
  selector: 'app-theme-selector',
  imports: [],
  templateUrl: './theme-selector.html',
  styleUrl: './theme-selector.css',
})
export class ThemeSelector {
  protected readonly ranking = inject(RankingService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly options = THEME_OPTIONS;
  protected readonly open = signal(false);

  protected toggleOpen(): void {
    this.open.update((v) => !v);
  }

  protected select(value: ThemeName): void {
    this.ranking.setTheme(value);
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }
}

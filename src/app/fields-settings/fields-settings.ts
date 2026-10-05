import { AfterViewInit, Component, ElementRef, ViewChild, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RankingService } from '../ranking.service';

@Component({
  selector: 'app-fields-settings',
  imports: [FormsModule],
  templateUrl: './fields-settings.html',
  styleUrl: './fields-settings.css',
})
export class FieldsSettings implements AfterViewInit {
  protected readonly ranking = inject(RankingService);

  readonly closed = output<void>();

  @ViewChild('dialogRef') private dialogRef!: ElementRef<HTMLDialogElement>;

  protected newFieldName = '';

  ngAfterViewInit(): void {
    this.dialogRef.nativeElement.showModal();
  }

  protected addField(): void {
    this.ranking.addField(this.newFieldName);
    this.newFieldName = '';
  }

  protected onObjectNameChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ranking.setObjectName(input.value);
  }

  protected onRename(id: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ranking.renameField(id, input.value);
  }

  protected close(): void {
    this.dialogRef.nativeElement.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogRef.nativeElement) {
      this.dialogRef.nativeElement.close();
    }
  }

  protected onDialogClose(): void {
    this.closed.emit();
  }
}

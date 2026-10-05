import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DEFAULT_VALUE, RankedObject } from '../models';
import { RankingService } from '../ranking.service';

/** Modal for creating or editing an object: fields, then criteria sliders, then notes. */
@Component({
  selector: 'app-object-editor',
  imports: [],
  templateUrl: './object-editor.html',
  styleUrl: './object-editor.css',
})
export class ObjectEditor implements OnInit, AfterViewInit {
  protected readonly ranking = inject(RankingService);

  /** When set, the editor edits this object in place instead of creating a new one. */
  readonly editObject = input<RankedObject | null>(null);

  readonly closed = output<void>();

  @ViewChild('dialogRef') private dialogRef!: ElementRef<HTMLDialogElement>;

  protected readonly fieldValues = signal<Record<string, string>>({});
  protected readonly values = signal<Record<string, number>>({});
  protected readonly notes = signal('');

  ngOnInit(): void {
    const existing = this.editObject();
    this.fieldValues.set(
      Object.fromEntries(this.ranking.fields().map((f) => [f.id, existing?.fieldValues[f.id] ?? ''])),
    );
    this.values.set(
      Object.fromEntries(this.ranking.criteria().map((c) => [c.id, existing?.values[c.id] ?? DEFAULT_VALUE])),
    );
    this.notes.set(existing?.notes ?? '');
  }

  ngAfterViewInit(): void {
    this.dialogRef.nativeElement.showModal();
  }

  protected setFieldValue(fieldId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fieldValues.update((v) => ({ ...v, [fieldId]: input.value }));
  }

  protected setValue(criterionId: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    this.values.update((v) => ({ ...v, [criterionId]: Number(input.value) }));
  }

  protected setNotes(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.notes.set(textarea.value);
  }

  protected save(): void {
    const existing = this.editObject();
    if (existing) {
      this.ranking.updateObject(existing.id, this.fieldValues(), this.values(), this.notes());
    } else {
      this.ranking.addObject(this.fieldValues(), this.values(), this.notes());
    }
    this.dialogRef.nativeElement.close();
  }

  protected cancel(): void {
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

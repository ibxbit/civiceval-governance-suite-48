import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: "app-content-create-form",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="create.emit()" class="panel">
      <input placeholder="Title" formControlName="title" />
      <textarea placeholder="Rich text" formControlName="richText"></textarea>
      <div
        class="drop-zone"
        [class.drag-over]="isDragOver"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <p>Drag and drop a media file here</p>
        <p>or</p>
        <input type="file" (change)="fileSelected.emit($event)" />
      </div>
      <p *ngIf="uploadedFileIds.length > 0">
        Uploaded file IDs: {{ uploadedFileIds.join(", ") }}
      </p>
      <input
        placeholder="File IDs comma separated"
        formControlName="fileIdsRaw"
      />
      <button type="submit">Create Draft</button>
    </form>
  `,
  styles: [
    `
      .drop-zone {
        border: 2px dashed #7f8c8d;
        border-radius: 10px;
        padding: 1rem;
        text-align: center;
        background: #f7faf8;
        transition:
          border-color 120ms ease,
          background-color 120ms ease;
      }

      .drop-zone.drag-over {
        border-color: #2c7a7b;
        background: #e6fffa;
      }

      .drop-zone p {
        margin: 0.25rem 0;
      }
    `,
  ],
})
export class ContentCreateFormComponent {
  @Input({ required: true }) public form!: FormGroup;
  @Input() public uploadedFileIds: number[] = [];
  @Output() public readonly create = new EventEmitter<void>();
  @Output() public readonly fileSelected = new EventEmitter<Event>();
  @Output() public readonly fileDropped = new EventEmitter<File>();

  protected isDragOver = false;

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = true;
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver = false;

    const file = event.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }

    this.fileDropped.emit(file);
  }
}

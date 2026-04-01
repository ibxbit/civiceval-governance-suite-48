import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

type ContentItem = {
  id: number;
  title: string;
  richText: string;
};

@Component({
  selector: "app-content-editor",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section *ngIf="selected" class="panel">
      <h2>{{ selected.title }}</h2>
      <textarea
        [value]="selected.richText"
        (change)="richTextChanged.emit($event)"
      ></textarea>
      <button type="button" (click)="save.emit()">Save Draft</button>
      <h3>Versions</h3>
      <ul>
        <li *ngFor="let version of versions">
          v{{ version.versionNumber }} - {{ version.action }}
          <button type="button" (click)="rollback.emit(version.versionNumber)">
            Rollback
          </button>
        </li>
      </ul>
    </section>
  `,
})
export class ContentEditorComponent {
  @Input() public selected: ContentItem | null = null;
  @Input() public versions: Array<{ versionNumber: number; action: string }> =
    [];
  @Output() public readonly richTextChanged = new EventEmitter<Event>();
  @Output() public readonly save = new EventEmitter<void>();
  @Output() public readonly rollback = new EventEmitter<number>();
}

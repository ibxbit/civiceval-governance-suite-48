import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

type ContentItem = {
  id: number;
  title: string;
  status: "draft" | "published";
};

@Component({
  selector: "app-content-list",
  standalone: true,
  imports: [CommonModule],
  template: `
    <ul>
      <li *ngFor="let item of items">
        <strong>{{ item.title }}</strong>
        <span>({{ item.status }})</span>
        <button type="button" (click)="open.emit(item.id)">Open</button>
        <button type="button" (click)="publishToggle.emit(item.id)">
          {{ item.status === "draft" ? "Publish" : "Draft" }}
        </button>
      </li>
    </ul>
  `,
})
export class ContentListComponent {
  @Input({ required: true }) public items: ContentItem[] = [];
  @Output() public readonly open = new EventEmitter<number>();
  @Output() public readonly publishToggle = new EventEmitter<number>();
}

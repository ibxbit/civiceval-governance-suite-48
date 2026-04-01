import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: "app-analytics-filter-form",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="apply.emit()" class="panel">
      <input type="date" formControlName="startDate" />
      <input type="date" formControlName="endDate" />
      <button type="submit">Apply</button>
      <button type="button" (click)="exportCsv.emit()">Export CSV</button>
    </form>
  `,
})
export class AnalyticsFilterFormComponent {
  @Input({ required: true }) public form!: FormGroup;
  @Output() public readonly apply = new EventEmitter<void>();
  @Output() public readonly exportCsv = new EventEmitter<void>();
}

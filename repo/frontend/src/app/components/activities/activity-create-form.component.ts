import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormGroup, ReactiveFormsModule } from "@angular/forms";

@Component({
  selector: "app-activity-create-form",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="submitted.emit()" class="panel">
      <input placeholder="Title" formControlName="title" />
      <textarea
        placeholder="Description"
        formControlName="description"
      ></textarea>
      <label
        ><input
          type="radio"
          formControlName="participationType"
          value="individual"
        />
        Individual</label
      >
      <label
        ><input type="radio" formControlName="participationType" value="team" />
        Team</label
      >
      <input type="datetime-local" formControlName="registrationStartAt" />
      <input type="datetime-local" formControlName="registrationEndAt" />
      <input type="datetime-local" formControlName="startsAt" />
      <input type="datetime-local" formControlName="endsAt" />
      <p class="error" *ngIf="error">{{ error }}</p>
      <button type="submit">Save</button>
    </form>
  `,
})
export class ActivityCreateFormComponent {
  @Input({ required: true }) public form!: FormGroup;
  @Input() public error = "";
  @Output() public readonly submitted = new EventEmitter<void>();
}

import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

type ActivityView = {
  id: number;
  title: string;
  participationType: "individual" | "team";
  startsAt: string;
  endsAt: string;
};

@Component({
  selector: "app-activities-table",
  standalone: true,
  imports: [CommonModule],
  template: `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Type</th>
          <th>Window</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr *ngFor="let activity of activities">
          <td>{{ activity.title }}</td>
          <td>{{ activity.participationType }}</td>
          <td>
            {{ activity.startsAt | date: "short" }} -
            {{ activity.endsAt | date: "short" }}
          </td>
          <td>
            <button type="button" (click)="selected.emit(activity.id)">
              Details
            </button>
            <button
              *ngIf="allowRegister"
              type="button"
              (click)="registered.emit(activity.id)"
            >
              Register
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  `,
})
export class ActivitiesTableComponent {
  @Input({ required: true }) public activities: ActivityView[] = [];
  @Input() public allowRegister = false;
  @Output() public readonly selected = new EventEmitter<number>();
  @Output() public readonly registered = new EventEmitter<number>();
}

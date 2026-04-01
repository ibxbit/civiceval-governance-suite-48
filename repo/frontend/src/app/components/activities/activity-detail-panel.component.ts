import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

type ActivityDetail = {
  id: number;
  title: string;
  description: string | null;
};

@Component({
  selector: "app-activity-detail-panel",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section *ngIf="activity" class="panel">
      <h2>{{ activity.title }}</h2>
      <p>{{ activity.description }}</p>
      <button
        *ngIf="canManage"
        type="button"
        (click)="generateCode.emit(activity.id)"
      >
        Generate Check-in Code
      </button>
      <p *ngIf="checkinCode">
        Code: <strong>{{ checkinCode }}</strong>
      </p>

      <h3>Registrations</h3>
      <p *ngIf="registrations.length === 0">No registrations yet.</p>
      <ul>
        <li *ngFor="let registration of registrations">
          {{ registration.username }}
        </li>
      </ul>
    </section>
  `,
})
export class ActivityDetailPanelComponent {
  @Input() public activity: ActivityDetail | null = null;
  @Input() public registrations: Array<{ id: number; username: string }> = [];
  @Input() public checkinCode = "";
  @Input() public canManage = false;
  @Output() public readonly generateCode = new EventEmitter<number>();
}

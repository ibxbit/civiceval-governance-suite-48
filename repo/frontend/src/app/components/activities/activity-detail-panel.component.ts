import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Component, EventEmitter, Input, Output } from "@angular/core";

type ActivityDetail = {
  id: number;
  title: string;
  description: string | null;
};

@Component({
  selector: "app-activity-detail-panel",
  standalone: true,
  imports: [CommonModule, FormsModule],
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

      <section *ngIf="canCheckin" class="manual-checkin">
        <h3>Manual Check-in</h3>
        <label for="checkin-code-input">One-time kiosk code</label>
        <input
          id="checkin-code-input"
          type="text"
          maxlength="8"
          autocomplete="off"
          [disabled]="checkinLoading"
          [ngModel]="manualCode"
          (ngModelChange)="manualCode = ($event ?? '').toUpperCase()"
          placeholder="AB12CD34"
        />
        <button
          type="button"
          [disabled]="checkinLoading"
          (click)="submitCheckin()"
        >
          {{ checkinLoading ? "Submitting..." : "Submit Check-in" }}
        </button>
        <p *ngIf="localCheckinError || checkinError" class="error">
          {{ localCheckinError || checkinError }}
        </p>
        <p *ngIf="checkinSuccess" class="success">{{ checkinSuccess }}</p>
      </section>

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
  @Input() public canCheckin = false;
  @Input() public checkinLoading = false;
  @Input() public checkinError = "";
  @Input() public checkinSuccess = "";
  @Output() public readonly generateCode = new EventEmitter<number>();
  @Output() public readonly checkinSubmitted = new EventEmitter<{
    activityId: number;
    code: string;
  }>();

  protected manualCode = "";
  protected localCheckinError = "";

  protected submitCheckin(): void {
    if (!this.activity) {
      return;
    }

    const normalized = this.manualCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(normalized)) {
      this.localCheckinError =
        "Enter a valid 8-character code (letters and numbers only).";
      return;
    }

    this.localCheckinError = "";
    this.checkinSubmitted.emit({
      activityId: this.activity.id,
      code: normalized,
    });
  }
}

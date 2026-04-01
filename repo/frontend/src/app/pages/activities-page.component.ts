import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { ActivityCreateFormComponent } from "../components/activities/activity-create-form.component";
import { ActivityDetailPanelComponent } from "../components/activities/activity-detail-panel.component";
import { ActivitiesTableComponent } from "../components/activities/activities-table.component";
import { AuthService } from "../services/auth.service";
import { ApiService } from "../services/api.service";

type Activity = {
  id: number;
  title: string;
  description: string | null;
  participationType: "individual" | "team";
  startsAt: string;
  endsAt: string;
  registrationStartAt: string;
  registrationEndAt: string;
};

@Component({
  selector: "app-activities-page",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ActivityCreateFormComponent,
    ActivityDetailPanelComponent,
    ActivitiesTableComponent,
  ],
  template: `
    <section class="page">
      <div class="page-head">
        <h1>Activities</h1>
        <button
          *ngIf="canManageActivities"
          type="button"
          (click)="toggleCreate()"
        >
          {{ showCreateForm ? "Close" : "Create Activity" }}
        </button>
      </div>

      <app-activity-create-form
        *ngIf="showCreateForm"
        [form]="createForm"
        [error]="createError"
        (submitted)="createActivity()"
      />

      <p *ngIf="isLoading">Loading activities...</p>
      <p *ngIf="!isLoading && errorMessage" class="error">{{ errorMessage }}</p>
      <p *ngIf="!isLoading && activities.length === 0">No activities found.</p>

      <app-activities-table
        *ngIf="activities.length > 0"
        [activities]="activities"
        [allowRegister]="canParticipate"
        (selected)="selectActivity($event)"
        (registered)="register($event)"
      />

      <app-activity-detail-panel
        [activity]="selectedActivity"
        [registrations]="registrations"
        [checkinCode]="checkinCode"
        [canManage]="canManageActivities"
        (generateCode)="generateCode($event)"
      />
    </section>
  `,
})
export class ActivitiesPageComponent {
  protected activities: Activity[] = [];
  protected registrations: Array<{ id: number; username: string }> = [];
  protected selectedActivity: Activity | null = null;
  protected checkinCode = "";
  protected isLoading = false;
  protected errorMessage = "";
  protected createError = "";
  protected showCreateForm = false;

  protected readonly canManageActivities: boolean;
  protected readonly canParticipate: boolean;

  protected readonly createForm;

  public constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly fb: FormBuilder,
  ) {
    this.createForm = this.fb.group({
      title: ["", [Validators.required]],
      description: [""],
      participationType: ["individual", [Validators.required]],
      registrationStartAt: ["", [Validators.required]],
      registrationEndAt: ["", [Validators.required]],
      startsAt: ["", [Validators.required]],
      endsAt: ["", [Validators.required]],
    });

    const role = this.auth.getCurrentUserSnapshot()?.role;
    this.canManageActivities = role === "program_owner" || role === "admin";
    this.canParticipate = role === "participant";
    this.loadActivities();
  }

  protected toggleCreate(): void {
    this.showCreateForm = !this.showCreateForm;
  }

  protected loadActivities(): void {
    this.isLoading = true;
    this.api
      .get<{ data: Activity[] }>("/activities", { page: 1, limit: 20 })
      .subscribe({
        next: (response: { data: Activity[] }) => {
          this.activities = response.data;
          this.isLoading = false;
        },
        error: () => {
          this.errorMessage = "Failed to load activities.";
          this.isLoading = false;
        },
      });
  }

  protected createActivity(): void {
    this.createError = "";
    if (this.createForm.invalid) {
      this.createError = "Fill all required fields.";
      return;
    }

    this.api.post("/activities", this.createForm.value).subscribe({
      next: () => {
        this.createForm.reset({ participationType: "individual" });
        this.showCreateForm = false;
        this.loadActivities();
      },
      error: () => {
        this.createError = "Failed to create activity.";
      },
    });
  }

  protected selectActivity(activityId: number): void {
    this.api
      .get<
        Activity & { registrationCount: number }
      >(`/activities/${activityId}`)
      .subscribe({
        next: (activity: Activity & { registrationCount: number }) => {
          this.selectedActivity = activity;
          this.loadRegistrations(activityId);
        },
      });
  }

  protected loadRegistrations(activityId: number): void {
    this.api
      .get<{
        data: Array<{ id: number; username: string }>;
      }>(`/activities/${activityId}/registrations`, { page: 1, limit: 20 })
      .subscribe({
        next: (response: { data: Array<{ id: number; username: string }> }) => {
          this.registrations = response.data;
        },
        error: () => {
          this.registrations = [];
        },
      });
  }

  protected register(activityId: number): void {
    this.api.post(`/activities/${activityId}/register`).subscribe();
  }

  protected generateCode(activityId: number): void {
    this.api
      .post<{ code: string }>(`/activities/${activityId}/checkin-code`, {
        expiresInSeconds: 300,
      })
      .subscribe({
        next: (response: { code: string }) => {
          this.checkinCode = response.code;
        },
      });
  }
}

import { CommonModule } from "@angular/common";
import { Component, OnDestroy } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { ActivityCreateFormComponent } from "../components/activities/activity-create-form.component";
import { ActivityDetailPanelComponent } from "../components/activities/activity-detail-panel.component";
import { ActivitiesTableComponent } from "../components/activities/activities-table.component";
import { AnalyticsService } from "../services/analytics.service";
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

      <form [formGroup]="searchForm" (ngSubmit)="searchActivities()">
        <label for="activity-search">Search activities</label>
        <input
          id="activity-search"
          type="search"
          formControlName="query"
          placeholder="Search by title or description"
        />
        <button type="submit">Search</button>
        <button type="button" (click)="clearSearch()">Clear</button>
      </form>

      <app-activity-create-form
        *ngIf="showCreateForm"
        [form]="createForm"
        [error]="createError"
        (submitted)="createActivity()"
      />

      <p *ngIf="isLoading">Loading activities...</p>
      <p *ngIf="!isLoading && errorMessage" class="error">{{ errorMessage }}</p>
      <p *ngIf="registrationMessage">{{ registrationMessage }}</p>
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
        [canCheckin]="canParticipate"
        [checkinLoading]="isCheckinLoading"
        [checkinError]="checkinError"
        [checkinSuccess]="checkinSuccess"
        (generateCode)="generateCode($event)"
        (checkinSubmitted)="submitCheckin($event)"
      />
    </section>
  `,
})
export class ActivitiesPageComponent implements OnDestroy {
  protected activities: Activity[] = [];
  protected registrations: Array<{ id: number; username: string }> = [];
  protected selectedActivity: Activity | null = null;
  protected checkinCode = "";
  protected isLoading = false;
  protected errorMessage = "";
  protected createError = "";
  protected showCreateForm = false;
  protected activeSearchQuery = "";
  protected isCheckinLoading = false;
  protected checkinError = "";
  protected checkinSuccess = "";
  protected registrationMessage = "";

  protected readonly canManageActivities: boolean;
  protected readonly canParticipate: boolean;

  protected readonly createForm;
  protected readonly searchForm;

  private selectedAtMs: number | null = null;
  private selectedActivityId: number | null = null;

  public constructor(
    private readonly api: ApiService,
    private readonly analytics: AnalyticsService,
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

    this.searchForm = this.fb.group({
      query: ["", [Validators.maxLength(120)]],
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
    const rawQuery = String(this.searchForm.controls.query.value ?? "").trim();
    const isSearching = rawQuery.length > 0;
    this.isLoading = true;
    this.api
      .get<{ data: Activity[] }>(isSearching ? "/activities/search" : "/activities", {
        page: 1,
        limit: 20,
        ...(isSearching ? { q: rawQuery } : {}),
      })
      .subscribe({
        next: (response: { data: Activity[] }) => {
          this.activities = response.data;
          this.activeSearchQuery = isSearching ? rawQuery : "";
          this.isLoading = false;
        },
        error: () => {
          this.errorMessage = "Failed to load activities.";
          this.isLoading = false;
        },
      });
  }

  protected searchActivities(): void {
    if (this.searchForm.invalid) {
      return;
    }

    const query = String(this.searchForm.controls.query.value ?? "").trim();
    if (query.length > 0) {
      this.analytics.trackSearch("/activities", query).subscribe({
        error: () => undefined,
      });
    }

    this.loadActivities();
  }

  protected clearSearch(): void {
    this.searchForm.reset({ query: "" });
    this.activeSearchQuery = "";
    this.loadActivities();
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
    this.flushDetailDwell();

    if (this.activeSearchQuery) {
      this.analytics.trackSearchClick("/activities", activityId).subscribe({
        error: () => undefined,
      });
    }

    this.api
      .get<
        Activity & { registrationCount: number }
      >(`/activities/${activityId}`)
      .subscribe({
        next: (activity: Activity & { registrationCount: number }) => {
          this.selectedActivity = activity;
          this.selectedAtMs = Date.now();
          this.selectedActivityId = activity.id;
          this.checkinError = "";
          this.checkinSuccess = "";
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
    this.registrationMessage = "";
    this.api.post(`/activities/${activityId}/register`).subscribe({
      next: () => {
        this.registrationMessage = "Registration successful.";
      },
      error: () => {
        this.registrationMessage = "Registration failed.";
      },
    });
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

  protected submitCheckin(payload: { activityId: number; code: string }): void {
    this.isCheckinLoading = true;
    this.checkinError = "";
    this.checkinSuccess = "";

    this.api
      .post(`/activities/${payload.activityId}/checkin`, { code: payload.code })
      .subscribe({
        next: () => {
          this.checkinSuccess = "Attendance submitted successfully.";
          this.isCheckinLoading = false;
        },
        error: () => {
          this.checkinError = "Check-in failed. Verify your one-time code.";
          this.isCheckinLoading = false;
        },
      });
  }

  public ngOnDestroy(): void {
    this.flushDetailDwell();
  }

  private flushDetailDwell(): void {
    if (!this.selectedAtMs || !this.selectedActivityId) {
      return;
    }

    const dwellMs = Date.now() - this.selectedAtMs;
    if (dwellMs <= 0) {
      return;
    }

    this.analytics
      .trackDwell("/activities", dwellMs, this.selectedActivityId)
      .subscribe({ error: () => undefined });

    if (dwellMs >= 10_000) {
      this.analytics
        .trackReadComplete("/activities", this.selectedActivityId)
        .subscribe({ error: () => undefined });
    }

    this.selectedAtMs = null;
    this.selectedActivityId = null;
  }
}

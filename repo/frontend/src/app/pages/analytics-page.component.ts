import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { AnalyticsCardsComponent } from "../components/analytics/analytics-cards.component";
import { AnalyticsFilterFormComponent } from "../components/analytics/analytics-filter-form.component";
import { AnalyticsInsightsComponent } from "../components/analytics/analytics-insights.component";
import { ApiService } from "../services/api.service";

type SummaryResponse = {
  pageViews: number;
  uniqueUsers: number;
  avgDwellMs: number;
  totalDwellMs: number;
  readCompletionRate: number;
  searchConversion: number;
  contentPopularity: Array<{ contentId: number; views: number }>;
  trafficSources: Array<{ referrer: string; visits: number }>;
};

@Component({
  selector: "app-analytics-page",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AnalyticsCardsComponent,
    AnalyticsFilterFormComponent,
    AnalyticsInsightsComponent,
  ],
  template: `
    <section class="page">
      <h1>Analytics</h1>

      <app-analytics-filter-form
        [form]="form"
        (apply)="load()"
        (exportCsv)="exportCsv()"
      />

      <p *ngIf="isLoading">Loading analytics...</p>
      <app-analytics-cards [summary]="summary" />
      <app-analytics-insights [summary]="summary" />
    </section>
  `,
})
export class AnalyticsPageComponent {
  protected readonly form;
  protected summary: SummaryResponse | null = null;
  protected isLoading = false;

  public constructor(
    private readonly api: ApiService,
    private readonly fb: FormBuilder,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    this.form = this.fb.group({
      startDate: [today, [Validators.required]],
      endDate: [today, [Validators.required]],
    });
    this.load();
  }

  protected load(): void {
    if (this.form.invalid) {
      return;
    }

    this.isLoading = true;
    this.api
      .get<SummaryResponse>("/analytics/summary", {
        startDate: this.form.controls.startDate.value,
        endDate: this.form.controls.endDate.value,
      })
      .subscribe({
        next: (response: SummaryResponse) => {
          this.summary = response;
          this.isLoading = false;
        },
        error: () => {
          this.summary = null;
          this.isLoading = false;
        },
      });
  }

  protected exportCsv(): void {
    const startDate = this.form.controls.startDate.value;
    const endDate = this.form.controls.endDate.value;
    const token = localStorage.getItem("auth.token") ?? "";
    const url = `/api/analytics/export.csv?startDate=${startDate}&endDate=${endDate}`;

    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "x-nonce": crypto.randomUUID(),
        "x-timestamp": String(Date.now()),
      },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("export failed");
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = `analytics-${startDate}-${endDate}.csv`;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      })
      .catch(() => undefined);
  }
}

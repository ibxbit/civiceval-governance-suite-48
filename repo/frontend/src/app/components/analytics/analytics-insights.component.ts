import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

type SummaryResponse = {
  readCompletionRate: number;
  searchConversion: number;
  contentPopularity: Array<{ contentId: number; views: number }>;
  trafficSources: Array<{ referrer: string; visits: number }>;
};

@Component({
  selector: "app-analytics-insights",
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="panel" *ngIf="summary">
      <h3>Read Completion Rate</h3>
      <p>{{ summary.readCompletionRate }}%</p>
      <h3>Search Conversion</h3>
      <p>{{ summary.searchConversion }}%</p>
    </section>

    <section
      class="panel"
      *ngIf="summary && summary.contentPopularity.length > 0"
    >
      <h3>Top Content</h3>
      <ul>
        <li *ngFor="let item of summary.contentPopularity">
          Content #{{ item.contentId }}: {{ item.views }} views
        </li>
      </ul>
    </section>

    <section class="panel" *ngIf="summary && summary.trafficSources.length > 0">
      <h3>Traffic Sources</h3>
      <ul>
        <li *ngFor="let source of summary.trafficSources">
          {{ source.referrer }}: {{ source.visits }} visits
        </li>
      </ul>
    </section>
  `,
})
export class AnalyticsInsightsComponent {
  @Input() public summary: SummaryResponse | null = null;
}

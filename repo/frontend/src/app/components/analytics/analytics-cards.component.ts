import { CommonModule } from "@angular/common";
import { Component, Input } from "@angular/core";

type SummaryResponse = {
  pageViews: number;
  uniqueUsers: number;
  avgDwellMs: number;
  totalDwellMs: number;
};

@Component({
  selector: "app-analytics-cards",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cards" *ngIf="summary">
      <article>
        <h3>Page Views</h3>
        <p>{{ summary.pageViews }}</p>
      </article>
      <article>
        <h3>Unique Visitors</h3>
        <p>{{ summary.uniqueUsers }}</p>
      </article>
      <article>
        <h3>Avg Dwell Time</h3>
        <p>{{ summary.avgDwellMs }}</p>
      </article>
      <article>
        <h3>Total Dwell Time</h3>
        <p>{{ summary.totalDwellMs }}</p>
      </article>
    </div>
  `,
})
export class AnalyticsCardsComponent {
  @Input() public summary: SummaryResponse | null = null;
}

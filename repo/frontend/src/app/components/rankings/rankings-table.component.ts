import { CommonModule } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

type RankingItem = {
  id: number;
  subjectKey: string;
  benchmark: number;
  price: number;
  volatility: number;
  weights: { benchmark: number; price: number; volatility: number };
  score: number;
};

@Component({
  selector: "app-rankings-table",
  standalone: true,
  imports: [CommonModule],
  template: `
    <table>
      <thead>
        <tr>
          <th>Subject</th>
          <th>Score</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <ng-container *ngFor="let ranking of rankings">
          <tr>
            <td>{{ ranking.subjectKey }}</td>
            <td>{{ ranking.score }}</td>
            <td>
              <button type="button" (click)="explain.emit(ranking.id)">
                Explain Why
              </button>
            </td>
          </tr>
          <tr *ngIf="expandedId === ranking.id">
            <td colspan="3">
              benchmark: {{ ranking.benchmark }} x
              {{ ranking.weights.benchmark }}% | price: {{ ranking.price }} x
              {{ ranking.weights.price }}% | volatility:
              {{ ranking.volatility }} x {{ ranking.weights.volatility }}%
            </td>
          </tr>
        </ng-container>
      </tbody>
    </table>
  `,
})
export class RankingsTableComponent {
  @Input({ required: true }) public rankings: RankingItem[] = [];
  @Input() public expandedId: number | null = null;
  @Output() public readonly explain = new EventEmitter<number>();
}

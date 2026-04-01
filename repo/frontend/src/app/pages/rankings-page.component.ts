import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { RankingsTableComponent } from "../components/rankings/rankings-table.component";
import { ApiService } from "../services/api.service";

type RankingItem = {
  id: number;
  subjectKey: string;
  benchmark: number;
  price: number;
  volatility: number;
  weights: {
    benchmark: number;
    price: number;
    volatility: number;
  };
  score: number;
};

@Component({
  selector: "app-rankings-page",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RankingsTableComponent],
  template: `
    <section class="page">
      <h1>Rankings</h1>

      <form [formGroup]="form" (ngSubmit)="submit()" class="panel">
        <input placeholder="Subject key" formControlName="subjectKey" />
        <input
          type="number"
          placeholder="Benchmark"
          formControlName="benchmark"
        />
        <input type="number" placeholder="Price" formControlName="price" />
        <input
          type="number"
          placeholder="Volatility"
          formControlName="volatility"
        />
        <input
          type="number"
          placeholder="Benchmark weight"
          formControlName="benchmarkWeight"
        />
        <input
          type="number"
          placeholder="Price weight"
          formControlName="priceWeight"
        />
        <input
          type="number"
          placeholder="Volatility weight"
          formControlName="volatilityWeight"
        />
        <p class="error" *ngIf="weightError">{{ weightError }}</p>
        <button type="submit">Score New Project</button>
      </form>

      <p *ngIf="isLoading">Loading rankings...</p>
      <p *ngIf="!isLoading && rankings.length === 0">No rankings available.</p>

      <app-rankings-table
        *ngIf="rankings.length > 0"
        [rankings]="rankings"
        [expandedId]="expandedId"
        (explain)="toggleExplain($event)"
      />
    </section>
  `,
})
export class RankingsPageComponent {
  protected rankings: RankingItem[] = [];
  protected isLoading = false;
  protected expandedId: number | null = null;

  protected readonly form;

  public constructor(
    private readonly api: ApiService,
    private readonly fb: FormBuilder,
  ) {
    this.form = this.fb.group({
      subjectKey: ["", [Validators.required]],
      benchmark: [0, [Validators.required]],
      price: [0, [Validators.required]],
      volatility: [0, [Validators.required]],
      benchmarkWeight: [40, [Validators.required]],
      priceWeight: [30, [Validators.required]],
      volatilityWeight: [30, [Validators.required]],
    });

    this.load();
  }

  protected get weightError(): string {
    const sum = this.weightSum();
    return sum === 100 ? "" : `Weights must sum to 100. Current: ${sum}`;
  }

  protected weightSum(): number {
    return (
      Number(this.form.controls.benchmarkWeight.value ?? 0) +
      Number(this.form.controls.priceWeight.value ?? 0) +
      Number(this.form.controls.volatilityWeight.value ?? 0)
    );
  }

  protected load(): void {
    this.isLoading = true;
    this.api.get<{ rankings: RankingItem[] }>("/rankings/latest").subscribe({
      next: (response: { rankings: RankingItem[] }) => {
        this.rankings = response.rankings;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      },
    });
  }

  protected submit(): void {
    if (this.form.invalid || this.weightSum() !== 100) {
      return;
    }

    this.api
      .post("/rankings/score", {
        subjectKey: this.form.controls.subjectKey.value,
        benchmark: Number(this.form.controls.benchmark.value),
        price: Number(this.form.controls.price.value),
        volatility: Number(this.form.controls.volatility.value),
        weights: {
          benchmark: Number(this.form.controls.benchmarkWeight.value),
          price: Number(this.form.controls.priceWeight.value),
          volatility: Number(this.form.controls.volatilityWeight.value),
        },
      })
      .subscribe({
        next: () => {
          this.load();
        },
      });
  }

  protected toggleExplain(id: number): void {
    this.expandedId = this.expandedId === id ? null : id;
  }
}

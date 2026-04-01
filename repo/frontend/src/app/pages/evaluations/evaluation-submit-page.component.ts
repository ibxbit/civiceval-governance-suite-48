import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { ApiService } from "../../services/api.service";

type Question = {
  id: number;
  prompt: string;
  type: "numeric_scale" | "comment";
  required: boolean;
};

@Component({
  selector: "app-evaluation-submit-page",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="page">
      <h1>Submit Evaluation</h1>

      <form [formGroup]="formIdForm" (ngSubmit)="loadForm()" class="panel">
        <input placeholder="Form ID" formControlName="formId" />
        <button type="submit">Load</button>
      </form>

      <form
        *ngIf="questions.length > 0"
        [formGroup]="responseForm"
        (ngSubmit)="submit()"
        class="panel"
      >
        <article *ngFor="let question of questions" class="panel">
          <h3>{{ question.prompt }}</h3>
          <ng-container [ngSwitch]="question.type">
            <select
              *ngSwitchCase="'numeric_scale'"
              [formControlName]="controlName(question.id)"
            >
              <option value="">Select 1-5</option>
              <option *ngFor="let value of [1, 2, 3, 4, 5]" [value]="value">
                {{ value }}
              </option>
            </select>
            <textarea
              *ngSwitchCase="'comment'"
              [formControlName]="controlName(question.id)"
              maxlength="500"
              placeholder="Add comment (max 500)"
            ></textarea>
          </ng-container>
          <p class="error" *ngIf="hasFieldError(question.id)">
            This required question must be answered.
          </p>
        </article>

        <p class="error" *ngIf="error">{{ error }}</p>
        <p *ngIf="receiptId">Submitted. Receipt ID: {{ receiptId }}</p>
        <button type="submit">Submit Evaluation</button>
      </form>
    </section>
  `,
})
export class EvaluationSubmitPageComponent {
  protected readonly formIdForm;
  protected readonly responseForm;
  protected questions: Question[] = [];
  protected error = "";
  protected receiptId = "";

  public constructor(
    private readonly api: ApiService,
    private readonly fb: FormBuilder,
  ) {
    this.formIdForm = this.fb.group({
      formId: ["", [Validators.required]],
    });

    this.responseForm = this.fb.group({});
  }

  protected loadForm(): void {
    this.error = "";
    this.receiptId = "";
    if (this.formIdForm.invalid) {
      return;
    }

    const formId = this.formIdForm.controls.formId.value;
    this.api
      .get<{ questions: Question[] }>(`/evaluations/forms/${formId}`)
      .subscribe({
        next: (response: { questions: Question[] }) => {
          this.questions = response.questions;
          for (const question of this.questions) {
            this.responseForm.addControl(
              this.controlName(question.id),
              this.fb.control(
                "",
                question.required ? [Validators.required] : [],
              ),
            );
          }
        },
        error: () => {
          this.error = "Unable to load form.";
        },
      });
  }

  protected submit(): void {
    this.error = "";
    this.receiptId = "";
    if (this.responseForm.invalid) {
      this.responseForm.markAllAsTouched();
      this.error = "Please answer all required questions.";
      return;
    }

    const formId = this.formIdForm.controls.formId.value;
    const responses = this.questions.map((question) => {
      const value =
        this.responseForm.controls[this.controlName(question.id)].value;
      if (question.type === "numeric_scale") {
        return { questionId: question.id, numericValue: Number(value) };
      }

      return { questionId: question.id, commentValue: String(value ?? "") };
    });

    this.api
      .post<{
        receiptId: string;
      }>(`/evaluations/forms/${formId}/submissions`, { responses })
      .subscribe({
        next: (response: { receiptId: string }) => {
          this.receiptId = response.receiptId;
        },
        error: () => {
          this.error = "Submission failed.";
        },
      });
  }

  protected controlName(questionId: number): string {
    return `q_${questionId}`;
  }

  protected hasFieldError(questionId: number): boolean {
    const control = this.responseForm.controls[this.controlName(questionId)];
    return !!control && control.invalid && control.touched;
  }
}

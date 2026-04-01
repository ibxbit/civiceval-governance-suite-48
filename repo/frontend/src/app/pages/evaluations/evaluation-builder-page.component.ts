import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";

import { ApiService } from "../../services/api.service";

@Component({
  selector: "app-evaluation-builder-page",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="page">
      <h1>Evaluation Builder</h1>
      <form [formGroup]="form" (ngSubmit)="save()" class="panel">
        <input placeholder="Form title" formControlName="title" />
        <textarea
          placeholder="Description"
          formControlName="description"
        ></textarea>

        <div formArrayName="questions" class="panel">
          <article
            *ngFor="let group of questions.controls; let index = index"
            [formGroupName]="index"
          >
            <input placeholder="Question prompt" formControlName="prompt" />
            <select formControlName="type">
              <option value="numeric_scale">Numeric 1-5</option>
              <option value="comment">Comment (max 500)</option>
            </select>
            <label
              ><input type="checkbox" formControlName="required" />
              Required</label
            >
            <button type="button" (click)="removeQuestion(index)">
              Remove
            </button>
          </article>
        </div>

        <button type="button" (click)="addQuestion()">Add Question</button>
        <p class="error" *ngIf="error">{{ error }}</p>
        <button type="submit">Create Form</button>
      </form>
    </section>
  `,
})
export class EvaluationBuilderPageComponent {
  protected readonly form;
  protected error = "";

  public constructor(
    private readonly fb: FormBuilder,
    private readonly api: ApiService,
  ) {
    this.form = this.fb.group({
      title: ["", [Validators.required, Validators.minLength(3)]],
      description: [""],
      questions: this.fb.array([this.createQuestionGroup()]),
    });
  }

  protected get questions(): FormArray {
    return this.form.controls.questions as FormArray;
  }

  protected addQuestion(): void {
    this.questions.push(this.createQuestionGroup());
  }

  protected removeQuestion(index: number): void {
    if (this.questions.length === 1) {
      return;
    }
    this.questions.removeAt(index);
  }

  protected save(): void {
    this.error = "";
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = "Please complete all required fields.";
      return;
    }

    this.api.post("/evaluations/forms", this.form.value).subscribe({
      next: () => {
        this.form.reset({ title: "", description: "" });
        this.questions.clear();
        this.questions.push(this.createQuestionGroup());
      },
      error: () => {
        this.error = "Failed to create form.";
      },
    });
  }

  private createQuestionGroup() {
    return this.fb.group({
      prompt: ["", [Validators.required]],
      type: ["numeric_scale", [Validators.required]],
      required: [false],
    });
  }
}

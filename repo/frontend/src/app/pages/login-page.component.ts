import { CommonModule } from "@angular/common";
import { Component } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router } from "@angular/router";

import { AuthService } from "../services/auth.service";

@Component({
  selector: "app-login-page",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="auth-page">
      <div class="auth-card">
        <h1>Sign In</h1>
        <p class="subtitle">Access CivicEval Governance Portal</p>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" novalidate>
          <label>
            Username
            <input
              type="text"
              formControlName="username"
              autocomplete="username"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              formControlName="password"
              autocomplete="current-password"
            />
          </label>

          <p class="error" *ngIf="fieldError">{{ fieldError }}</p>
          <p class="error" *ngIf="errorMessage">{{ errorMessage }}</p>

          <button type="submit" [disabled]="isSubmitting">
            {{ isSubmitting ? "Signing in..." : "Sign In" }}
          </button>
        </form>
      </div>
    </section>
  `,
})
export class LoginPageComponent {
  protected readonly form;

  protected isSubmitting = false;
  protected errorMessage = "";

  public constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.form = this.fb.group({
      username: ["", [Validators.required, Validators.minLength(3)]],
      password: ["", [Validators.required]],
    });
  }

  protected get fieldError(): string {
    if (!this.form.touched || this.form.valid) {
      return "";
    }

    if (this.form.controls.username.invalid) {
      return "Username is required";
    }

    if (this.form.controls.password.invalid) {
      return "Password is required";
    }

    return "";
  }

  protected onSubmit(): void {
    this.errorMessage = "";
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const username = this.form.controls.username.value ?? "";
    const password = this.form.controls.password.value ?? "";
    this.isSubmitting = true;

    this.auth.login(username, password).subscribe({
      next: () => {
        this.isSubmitting = false;
        void this.router.navigateByUrl("/activities");
      },
      error: (error: { status?: number }) => {
        this.isSubmitting = false;
        if (error.status === 401) {
          this.errorMessage = "Invalid username or password.";
          return;
        }
        if (error.status === 423) {
          this.errorMessage = "Account locked. Please retry in 15 minutes.";
          return;
        }
        this.errorMessage = "Unable to sign in. Please try again.";
      },
    });
  }
}

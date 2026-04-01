import { Routes } from "@angular/router";

import { authGuard } from "./guards/auth.guard";
import { roleGuard } from "./guards/role.guard";
import { AppShellComponent } from "./layout/app-shell.component";
import { ActivitiesPageComponent } from "./pages/activities-page.component";
import { AnalyticsPageComponent } from "./pages/analytics-page.component";
import { ContentLibraryPageComponent } from "./pages/content-library-page.component";
import { EvaluationBuilderPageComponent } from "./pages/evaluations/evaluation-builder-page.component";
import { EvaluationSubmitPageComponent } from "./pages/evaluations/evaluation-submit-page.component";
import { LoginPageComponent } from "./pages/login-page.component";
import { ModerationQueuePageComponent } from "./pages/moderation/moderation-queue-page.component";
import { RankingsPageComponent } from "./pages/rankings-page.component";

export const appRoutes: Routes = [
  { path: "login", component: LoginPageComponent },
  {
    path: "",
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      { path: "", pathMatch: "full", redirectTo: "activities" },
      {
        path: "activities",
        component: ActivitiesPageComponent,
      },
      {
        path: "content-library",
        component: ContentLibraryPageComponent,
        canActivate: [roleGuard],
        data: { roles: ["program_owner", "admin"] },
      },
      {
        path: "rankings",
        component: RankingsPageComponent,
        canActivate: [roleGuard],
        data: { roles: ["program_owner", "admin", "reviewer"] },
      },
      {
        path: "analytics",
        component: AnalyticsPageComponent,
        canActivate: [roleGuard],
        data: { roles: ["program_owner", "admin"] },
      },
      {
        path: "evaluations/builder",
        component: EvaluationBuilderPageComponent,
        canActivate: [roleGuard],
        data: { roles: ["program_owner", "admin"] },
      },
      {
        path: "evaluations/submit",
        component: EvaluationSubmitPageComponent,
        canActivate: [roleGuard],
        data: { roles: ["participant"] },
      },
      {
        path: "moderation",
        component: ModerationQueuePageComponent,
        canActivate: [roleGuard],
        data: { roles: ["reviewer", "admin"] },
      },
    ],
  },
  { path: "**", redirectTo: "/login" },
];

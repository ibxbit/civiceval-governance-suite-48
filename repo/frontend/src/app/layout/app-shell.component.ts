import { CommonModule } from "@angular/common";
import { Component, OnDestroy } from "@angular/core";
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from "@angular/router";
import { Subscription, filter, map } from "rxjs";

import { AnalyticsService } from "../services/analytics.service";
import { AuthService, type UserRole } from "../services/auth.service";

type NavItem = {
  label: string;
  route: string;
  roles: UserRole[];
};

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="app-shell">
      <aside class="side-nav" aria-label="Primary">
        <div class="brand">Eaglepoint</div>
        <small *ngIf="localOnlyBoundaryNotice" class="boundary-notice">
          {{ localOnlyBoundaryNotice }}
        </small>
        <div class="user" *ngIf="user$ | async as user">
          <div>{{ user.username }}</div>
          <small>{{ user.role }}</small>
        </div>
        <nav>
          <a
            *ngFor="let item of visibleNavItems$ | async"
            [routerLink]="item.route"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: true }"
          >
            {{ item.label }}
          </a>
        </nav>
        <button type="button" class="logout" (click)="logout()">Logout</button>
      </aside>
      <main class="content-area">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppShellComponent implements OnDestroy {
  protected readonly user$;
  protected readonly visibleNavItems$;
  private readonly routerEventsSubscription: Subscription;
  protected readonly localOnlyBoundaryNotice: string;

  protected readonly navItems: NavItem[] = [
    {
      label: "Activities",
      route: "/activities",
      roles: ["participant", "reviewer", "program_owner", "admin"],
    },
    {
      label: "Content Library",
      route: "/content-library",
      roles: ["program_owner", "admin"],
    },
    {
      label: "Rankings",
      route: "/rankings",
      roles: ["program_owner", "admin", "reviewer"],
    },
    {
      label: "Analytics",
      route: "/analytics",
      roles: ["program_owner", "admin"],
    },
    {
      label: "Form Builder",
      route: "/evaluations/builder",
      roles: ["program_owner", "admin"],
    },
    {
      label: "Submit Eval",
      route: "/evaluations/submit",
      roles: ["participant"],
    },
    {
      label: "Moderation",
      route: "/moderation",
      roles: ["reviewer", "admin"],
    },
  ];

  public constructor(
    private readonly auth: AuthService,
    private readonly analytics: AnalyticsService,
    private readonly router: Router,
  ) {
    this.user$ = this.auth.currentUser$;
    this.visibleNavItems$ = this.user$.pipe(
      map((user: { role: UserRole } | null) => {
        if (!user) {
          return [];
        }

        return this.navItems.filter((item) => item.roles.includes(user.role));
      }),
    );

    this.routerEventsSubscription = this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.analytics
          .trackPageView(event.urlAfterRedirects, document.referrer)
          .subscribe({ error: () => undefined });
      });

    this.localOnlyBoundaryNotice =
      "Local-only mode: use localhost/private-network deployment only.";
  }

  public ngOnDestroy(): void {
    this.routerEventsSubscription.unsubscribe();
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => {
        void this.router.navigateByUrl("/login");
      },
      error: () => {
        this.auth.forceLogout();
        void this.router.navigateByUrl("/login");
      },
    });
  }
}

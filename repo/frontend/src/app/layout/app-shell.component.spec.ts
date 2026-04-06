import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import { Subject, of } from "rxjs";

import { AppShellComponent } from "./app-shell.component";
import { AnalyticsService } from "../services/analytics.service";
import { AuthService } from "../services/auth.service";

describe("AppShellComponent", () => {
  let fixture: ComponentFixture<AppShellComponent>;
  let component: AppShellComponent;
  let auth: jasmine.SpyObj<AuthService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;
  const routerEvents = new Subject<unknown>();

  beforeEach(async () => {
    auth = jasmine.createSpyObj<AuthService>("AuthService", ["logout", "forceLogout"], {
      currentUser$: of({ id: 1, username: "owner", role: "program_owner" }),
    });
    auth.logout.and.returnValue(of({ success: true }));

    analytics = jasmine.createSpyObj<AnalyticsService>("AnalyticsService", ["trackPageView"]);
    analytics.trackPageView.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AnalyticsService, useValue: analytics },
        { provide: ActivatedRoute, useValue: { snapshot: { data: {} } } },
        {
          provide: Router,
          useValue: {
            events: routerEvents.asObservable(),
            createUrlTree: jasmine.createSpy("createUrlTree").and.returnValue({}),
            serializeUrl: jasmine.createSpy("serializeUrl").and.returnValue("/activities"),
            navigateByUrl: jasmine.createSpy("navigateByUrl").and.returnValue(Promise.resolve(true)),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("filters navigation by role", () => {
    (component as any).visibleNavItems$.subscribe((items: Array<{ label: string }>) => {
      const labels = items.map((item) => item.label);
      expect(labels).toContain("Content Library");
      expect(labels).not.toContain("Submit Eval");
    });
  });

  it("logs out through auth service", () => {
    (component as any).logout();
    expect(auth.logout).toHaveBeenCalled();
  });
});

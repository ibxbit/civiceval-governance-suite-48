import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Observable, of, throwError } from "rxjs";

import { ActivitiesPageComponent } from "./activities-page.component";
import { AnalyticsService } from "../services/analytics.service";
import { ApiService } from "../services/api.service";
import { AuthService } from "../services/auth.service";

describe("ActivitiesPageComponent", () => {
  let fixture: ComponentFixture<ActivitiesPageComponent>;
  let component: ActivitiesPageComponent;
  let api: jasmine.SpyObj<ApiService>;
  let auth: jasmine.SpyObj<AuthService>;
  let analytics: jasmine.SpyObj<AnalyticsService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>("ApiService", ["get", "post"]);
    auth = jasmine.createSpyObj<AuthService>("AuthService", ["getCurrentUserSnapshot"]);
    analytics = jasmine.createSpyObj<AnalyticsService>("AnalyticsService", [
      "trackSearch",
      "trackSearchClick",
      "trackDwell",
      "trackReadComplete",
    ]);

    auth.getCurrentUserSnapshot.and.returnValue({
      id: 1,
      username: "participant",
      role: "participant",
    });

    api.get.and.callFake(<T>(path: string): Observable<T> => {
      if (path === "/activities") {
        return of({
          data: [
            {
              id: 7,
              title: "Town Hall",
              description: "desc",
              participationType: "individual",
              startsAt: "2026-01-01T10:00:00.000Z",
              endsAt: "2026-01-01T11:00:00.000Z",
              registrationStartAt: "2025-12-25T10:00:00.000Z",
              registrationEndAt: "2025-12-30T10:00:00.000Z",
            },
          ],
        }) as unknown as Observable<T>;
      }

      if (path === "/activities/search") {
        return of({ data: [] }) as unknown as Observable<T>;
      }

      if (path === "/activities/7") {
        return of({
          id: 7,
          title: "Town Hall",
          description: "desc",
          participationType: "individual",
          startsAt: "2026-01-01T10:00:00.000Z",
          endsAt: "2026-01-01T11:00:00.000Z",
          registrationStartAt: "2025-12-25T10:00:00.000Z",
          registrationEndAt: "2025-12-30T10:00:00.000Z",
          registrationCount: 1,
        }) as unknown as Observable<T>;
      }

      if (path === "/activities/7/registrations") {
        return of({ data: [{ id: 1, username: "participant" }] }) as unknown as Observable<T>;
      }

      return of({ data: [] }) as unknown as Observable<T>;
    });

    api.post.and.returnValue(of({ success: true }));
    analytics.trackSearch.and.returnValue(of({}));
    analytics.trackSearchClick.and.returnValue(of({}));
    analytics.trackDwell.and.returnValue(of({}));
    analytics.trackReadComplete.and.returnValue(of({}));

    await TestBed.configureTestingModule({
      imports: [ActivitiesPageComponent],
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ActivitiesPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("loads and registers successfully", () => {
    expect((component as any).activities.length).toBe(1);

    (component as any).register(7);
    expect((component as any).registrationMessage).toBe("Registration successful.");
  });

  it("handles check-in success and failure states", () => {
    (component as any).submitCheckin({ activityId: 7, code: "AB12CD34" });
    expect((component as any).checkinSuccess).toContain("Attendance submitted");

    api.post.and.returnValue(throwError(() => ({ status: 401 })));
    (component as any).submitCheckin({ activityId: 7, code: "AB12CD34" });
    expect((component as any).checkinError).toContain("Check-in failed");
  });

  it("uses search endpoint and emits search analytics", () => {
    (component as any).searchForm.controls.query.setValue("town");
    (component as any).searchActivities();

    expect(analytics.trackSearch).toHaveBeenCalledWith("/activities", "town");
    expect(api.get).toHaveBeenCalledWith("/activities/search", jasmine.any(Object));
  });
});

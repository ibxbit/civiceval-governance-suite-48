import { ComponentFixture, TestBed, fakeAsync, tick } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { AnalyticsPageComponent } from "./analytics-page.component";
import { ApiService } from "../services/api.service";

describe("AnalyticsPageComponent", () => {
  let fixture: ComponentFixture<AnalyticsPageComponent>;
  let component: AnalyticsPageComponent;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>("ApiService", ["get"]);
    api.get.and.returnValue(
      of({
        pageViews: 5,
        uniqueUsers: 2,
        avgDwellMs: 123,
        totalDwellMs: 246,
        readCompletionRate: 50,
        searchConversion: 20,
        contentPopularity: [],
        trafficSources: [],
      }),
    );

    await TestBed.configureTestingModule({
      imports: [AnalyticsPageComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("loads analytics summary", () => {
    expect(api.get).toHaveBeenCalledWith("/analytics/summary", jasmine.any(Object));
    expect((component as any).summary?.pageViews).toBe(5);
  });

  it("handles summary load failures", () => {
    api.get.and.returnValue(throwError(() => ({ status: 500 })));
    (component as any).load();
    expect((component as any).summary).toBeNull();
  });

  it("sets export error when csv export fails", fakeAsync(() => {
    spyOn(window, "fetch").and.returnValue(
      Promise.resolve({ ok: false } as Response),
    );

    (component as any).exportCsv();
    tick();

    expect((component as any).exportError).toContain("CSV export failed");
  }));

  it("exports csv when request succeeds", fakeAsync(() => {
    const clickSpy = jasmine.createSpy("click");
    spyOn(window, "fetch").and.returnValue(
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(["csv"])),
      } as Response),
    );
    spyOn(URL, "createObjectURL").and.returnValue("blob:test");
    spyOn(URL, "revokeObjectURL").and.callFake(() => undefined);
    spyOn(document, "createElement").and.returnValue({
      href: "",
      download: "",
      click: clickSpy,
    } as unknown as HTMLAnchorElement);

    (component as any).exportCsv();
    tick();
    tick();

    expect(clickSpy).toHaveBeenCalled();
  }));
});

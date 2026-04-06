import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { RankingsPageComponent } from "./rankings-page.component";
import { ApiService } from "../services/api.service";

describe("RankingsPageComponent", () => {
  let fixture: ComponentFixture<RankingsPageComponent>;
  let component: RankingsPageComponent;
  let api: jasmine.SpyObj<ApiService>;

  beforeEach(async () => {
    api = jasmine.createSpyObj<ApiService>("ApiService", ["get", "post"]);
    api.get.and.returnValue(of({ rankings: [] }));
    api.post.and.returnValue(of({ success: true }));

    await TestBed.configureTestingModule({
      imports: [RankingsPageComponent],
      providers: [{ provide: ApiService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(RankingsPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("blocks submission when weights do not sum to 100", () => {
    (component as any).form.patchValue({ benchmarkWeight: 50, priceWeight: 30, volatilityWeight: 10 });
    (component as any).submit();

    expect(api.post).not.toHaveBeenCalled();
    expect((component as any).submitError).toContain("weights sum to 100");
  });

  it("submits ranking and shows success", () => {
    (component as any).form.patchValue({
      subjectKey: "project-a",
      benchmark: 90,
      price: 80,
      volatility: 70,
      benchmarkWeight: 40,
      priceWeight: 30,
      volatilityWeight: 30,
    });
    (component as any).submit();

    expect(api.post).toHaveBeenCalledWith("/rankings/score", jasmine.any(Object));
    expect((component as any).submitSuccess).toContain("Ranking submitted");
  });

  it("shows error when submit fails", () => {
    api.post.and.returnValue(throwError(() => ({ status: 500 })));
    (component as any).form.patchValue({
      subjectKey: "project-a",
      benchmark: 90,
      price: 80,
      volatility: 70,
      benchmarkWeight: 40,
      priceWeight: 30,
      volatilityWeight: 30,
    });
    (component as any).submit();

    expect((component as any).submitError).toContain("Failed to submit ranking");
  });
});

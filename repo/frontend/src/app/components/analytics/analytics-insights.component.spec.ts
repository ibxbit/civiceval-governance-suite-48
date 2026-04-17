import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { AnalyticsInsightsComponent } from "./analytics-insights.component";

describe("AnalyticsInsightsComponent", () => {
  let fixture: ComponentFixture<AnalyticsInsightsComponent>;

  const mockSummary = {
    readCompletionRate: 72,
    searchConversion: 18,
    contentPopularity: [
      { contentId: 1, views: 540 },
      { contentId: 2, views: 320 },
    ],
    trafficSources: [
      { referrer: "google.com", visits: 800 },
      { referrer: "direct", visits: 450 },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsInsightsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsInsightsComponent);
  });

  it("does not render any sections when summary is null", () => {
    fixture.componentRef.setInput("summary", null);
    fixture.detectChanges();

    const sections = fixture.debugElement.queryAll(By.css("section.panel"));
    expect(sections.length).toBe(0);
  });

  it("renders read completion rate and search conversion when summary is provided", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const sections = fixture.debugElement.queryAll(By.css("section.panel"));
    expect(sections.length).toBeGreaterThan(0);

    const firstSection = sections[0];
    expect(firstSection.nativeElement.textContent).toContain(
      "Read Completion Rate",
    );
    expect(firstSection.nativeElement.textContent).toContain(
      "Search Conversion",
    );
  });

  it("renders content popularity list when contentPopularity has items", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const sections = fixture.debugElement.queryAll(By.css("section.panel"));
    const topContentSection = sections.find((s) =>
      s.nativeElement.textContent.includes("Top Content"),
    );

    expect(topContentSection).toBeTruthy();

    const listItems = topContentSection!.queryAll(By.css("li"));
    expect(listItems.length).toBe(2);
  });

  it("does not render content popularity section when array is empty", () => {
    fixture.componentRef.setInput("summary", {
      ...mockSummary,
      contentPopularity: [],
    });
    fixture.detectChanges();

    const sections = fixture.debugElement.queryAll(By.css("section.panel"));
    const topContentSection = sections.find((s) =>
      s.nativeElement.textContent.includes("Top Content"),
    );

    expect(topContentSection).toBeUndefined();
  });

  it("renders traffic sources list when trafficSources has items", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const sections = fixture.debugElement.queryAll(By.css("section.panel"));
    const trafficSection = sections.find((s) =>
      s.nativeElement.textContent.includes("Traffic Sources"),
    );

    expect(trafficSection).toBeTruthy();

    const listItems = trafficSection!.queryAll(By.css("li"));
    expect(listItems.length).toBe(2);
  });

  it("does not render traffic sources section when array is empty", () => {
    fixture.componentRef.setInput("summary", {
      ...mockSummary,
      trafficSources: [],
    });
    fixture.detectChanges();

    const sections = fixture.debugElement.queryAll(By.css("section.panel"));
    const trafficSection = sections.find((s) =>
      s.nativeElement.textContent.includes("Traffic Sources"),
    );

    expect(trafficSection).toBeUndefined();
  });

  it("displays correct percentage values", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const sections = fixture.debugElement.queryAll(By.css("section.panel"));
    const metricsSection = sections[0];

    expect(metricsSection.nativeElement.textContent).toContain("72%");
    expect(metricsSection.nativeElement.textContent).toContain("18%");
  });
});

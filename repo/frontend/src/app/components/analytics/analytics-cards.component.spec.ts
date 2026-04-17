import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";

import { AnalyticsCardsComponent } from "./analytics-cards.component";

describe("AnalyticsCardsComponent", () => {
  let fixture: ComponentFixture<AnalyticsCardsComponent>;

  const mockSummary = {
    pageViews: 1024,
    uniqueUsers: 312,
    avgDwellMs: 4500,
    totalDwellMs: 1404000,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsCardsComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalyticsCardsComponent);
  });

  it("does not render cards when summary is null", () => {
    fixture.componentRef.setInput("summary", null);
    fixture.detectChanges();

    const cardsContainer = fixture.debugElement.query(By.css("div.cards"));
    expect(cardsContainer).toBeNull();
  });

  it("renders all 4 metric cards when summary is provided", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css("article"));
    expect(cards.length).toBe(4);
  });

  it("displays correct Page Views value", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css("article"));
    const pageViewsCard = cards.find((card) =>
      card.nativeElement.textContent.includes("Page Views"),
    );

    expect(pageViewsCard?.nativeElement.textContent).toContain("1024");
  });

  it("displays correct Unique Visitors value", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css("article"));
    const uniqueUsersCard = cards.find((card) =>
      card.nativeElement.textContent.includes("Unique Visitors"),
    );

    expect(uniqueUsersCard?.nativeElement.textContent).toContain("312");
  });

  it("displays correct Avg Dwell Time value", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css("article"));
    const avgDwellCard = cards.find((card) =>
      card.nativeElement.textContent.includes("Avg Dwell Time"),
    );

    expect(avgDwellCard?.nativeElement.textContent).toContain("4500");
  });

  it("displays correct Total Dwell Time value", () => {
    fixture.componentRef.setInput("summary", mockSummary);
    fixture.detectChanges();

    const cards = fixture.debugElement.queryAll(By.css("article"));
    const totalDwellCard = cards.find((card) =>
      card.nativeElement.textContent.includes("Total Dwell Time"),
    );

    expect(totalDwellCard?.nativeElement.textContent).toContain("1404000");
  });
});

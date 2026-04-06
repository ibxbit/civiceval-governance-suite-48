import { of } from "rxjs";

import { AnalyticsService } from "./analytics.service";
import { ApiService } from "./api.service";

describe("AnalyticsService", () => {
  it("posts required analytics event types", () => {
    const api = jasmine.createSpyObj<ApiService>("ApiService", ["post"]);
    api.post.and.returnValue(of({ success: true }));
    const service = new AnalyticsService(api);

    service.trackPageView("/activities", "https://referrer").subscribe();
    service.trackDwell("/activities", 1234, 91).subscribe();
    service.trackReadComplete("/activities", 91).subscribe();
    service.trackSearch("/activities", "health").subscribe();
    service.trackSearchClick("/activities", 91).subscribe();

    expect(api.post).toHaveBeenCalledWith("/analytics/events", {
      eventType: "page_view",
      pagePath: "/activities",
      referrer: "https://referrer",
    });
    expect(api.post).toHaveBeenCalledWith("/analytics/events", {
      eventType: "dwell",
      pagePath: "/activities",
      dwellMs: 1234,
      contentId: 91,
    });
    expect(api.post).toHaveBeenCalledWith("/analytics/events", {
      eventType: "read_complete",
      pagePath: "/activities",
      contentId: 91,
    });
    expect(api.post).toHaveBeenCalledWith("/analytics/events", {
      eventType: "search",
      pagePath: "/activities",
      referrer: "health",
    });
    expect(api.post).toHaveBeenCalledWith("/analytics/events", {
      eventType: "search_click",
      pagePath: "/activities",
      contentId: 91,
    });
  });
});

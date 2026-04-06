import { appRoutes } from "./app.routes";

describe("appRoutes", () => {
  it("declares protected role routes for major modules", () => {
    const shell = appRoutes.find((route) => route.path === "");
    expect(shell).toBeDefined();

    const children = shell?.children ?? [];
    const moderation = children.find((route) => route.path === "moderation");
    const analytics = children.find((route) => route.path === "analytics");
    const rankings = children.find((route) => route.path === "rankings");
    const submitEval = children.find((route) => route.path === "evaluations/submit");

    expect(moderation?.data?.["roles"]).toEqual(["reviewer", "admin"]);
    expect(analytics?.data?.["roles"]).toEqual(["program_owner", "admin"]);
    expect(rankings?.data?.["roles"]).toEqual([
      "program_owner",
      "admin",
      "reviewer",
    ]);
    expect(submitEval?.data?.["roles"]).toEqual(["participant"]);
  });
});

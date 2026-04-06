import { TestBed } from "@angular/core/testing";
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from "@angular/router";

import { roleGuard } from "./role.guard";
import { AuthService, type AuthUser } from "../services/auth.service";

describe("roleGuard", () => {
  let authService: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    authService = jasmine.createSpyObj<AuthService>("AuthService", [
      "getCurrentUserSnapshot",
    ]);
    router = jasmine.createSpyObj<Router>("Router", ["createUrlTree"]);
    router.createUrlTree.and.returnValue({} as never);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
  });

  it("allows navigation when route has no role requirements", () => {
    const route = { data: {} } as unknown as ActivatedRouteSnapshot;

    const result = TestBed.runInInjectionContext(() => roleGuard(route, state));

    expect(result).toBeTrue();
  });

  it("allows navigation when user role is in allowlist", () => {
    const route = {
      data: { roles: ["admin", "reviewer"] },
    } as unknown as ActivatedRouteSnapshot;
    authService.getCurrentUserSnapshot.and.returnValue({
      id: 2,
      username: "reviewer-user",
      role: "reviewer",
    } as AuthUser);

    const result = TestBed.runInInjectionContext(() => roleGuard(route, state));

    expect(result).toBeTrue();
  });

  it("redirects to activities when user role is not allowed", () => {
    const route = {
      data: { roles: ["admin"] },
    } as unknown as ActivatedRouteSnapshot;
    authService.getCurrentUserSnapshot.and.returnValue({
      id: 3,
      username: "participant-user",
      role: "participant",
    } as AuthUser);

    TestBed.runInInjectionContext(() => roleGuard(route, state));

    expect(router.createUrlTree).toHaveBeenCalledWith(["/activities"]);
  });
});
  const state = { url: "/activities" } as RouterStateSnapshot;

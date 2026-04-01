import { TestBed } from "@angular/core/testing";
import { Router } from "@angular/router";

import { authGuard } from "./auth.guard";
import { AuthService, type AuthUser } from "../services/auth.service";

describe("authGuard", () => {
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

  it("allows navigation when user is logged in", () => {
    authService.getCurrentUserSnapshot.and.returnValue({
      id: 1,
      username: "alice",
      role: "participant",
    } as AuthUser);

    const result = TestBed.runInInjectionContext(() => authGuard());

    expect(result).toBeTrue();
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it("redirects to login when user is anonymous", () => {
    authService.getCurrentUserSnapshot.and.returnValue(null);

    TestBed.runInInjectionContext(() => authGuard());

    expect(router.createUrlTree).toHaveBeenCalledWith(["/login"]);
  });
});

import { inject } from "@angular/core";
import { ActivatedRouteSnapshot, CanActivateFn, Router } from "@angular/router";

import { AuthService, type UserRole } from "../services/auth.service";

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const allowedRoles = (route.data["roles"] as UserRole[] | undefined) ?? [];
  if (allowedRoles.length === 0) {
    return true;
  }

  const user = auth.getCurrentUserSnapshot();
  if (user && allowedRoles.includes(user.role)) {
    return true;
  }

  return router.createUrlTree(["/activities"]);
};

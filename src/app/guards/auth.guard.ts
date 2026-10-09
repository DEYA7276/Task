import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, filter, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authInitialized$.pipe(
    filter((initialized) => initialized),
    take(1),
    map(() => {
      if (authService.isAuthenticated) {
        return true;
      }
      return router.createUrlTree(['/login']);
    })
  );
};

export const publicGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.authInitialized$.pipe(
    filter((initialized) => initialized),
    take(1),
    map(() => {
      if (!authService.isAuthenticated) {
        return true;
      }
      return router.createUrlTree(['/tasks']);
    })
  );
};

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuditAction } from '../entities/audit-log.entity';
import { AuditService } from '../audit.service';

/** Maps HTTP method + route pattern to an AuditAction */
const ROUTE_ACTION_MAP: Record<string, AuditAction> = {
  'POST /users/:address/follow': AuditAction.USER_FOLLOWED,
  'POST /users/:address/unfollow': AuditAction.USER_UNFOLLOWED,
  'POST /calls': AuditAction.CALL_CREATED,
  'POST /calls/:id/resolve': AuditAction.CALL_RESOLVED,
  'POST /calls/:id/settle': AuditAction.CALL_SETTLED,
  'POST /calls/:id/stake': AuditAction.STAKE_PLACED,
};

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();

    // Only audit mutating methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const routeKey = `${req.method} ${req.route?.path ?? req.path}`;
        const action = ROUTE_ACTION_MAP[routeKey];

        if (!action) {
          return;
        }

        this.auditService.log({
          action,
          actorAddress: (req as any).user?.address,
          targetId: req.params?.id ?? req.params?.address,
          requestMeta: {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            method: req.method,
            path: req.path,
          },
        });
      }),
    );
  }
}

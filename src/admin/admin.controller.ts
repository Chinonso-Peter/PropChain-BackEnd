import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthUserPayload } from '../auth/types/auth-user.type';
import { UserRole } from '../types/prisma.types';
import { AdminService } from './admin.service';
import {
  AddFraudInvestigationNoteDto,
  AdminUpdateUserDto,
  AdminUsersQueryDto,
  BlockFraudUserDto,
  BulkModerationDto,
  FlagPropertyDto,
  FraudAlertsQueryDto,
  ModerationQueueQueryDto,
  ReviewFraudAlertDto,
  TransactionMonitoringQueryDto,
} from './dto/admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  listUsers(@Query() query: AdminUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id')
  updateUser(@Param('id') userId: string, @Body() payload: AdminUpdateUserDto) {
    return this.adminService.updateUser(userId, payload);
  }

  @Post('users/:id/block')
  blockUser(@Param('id') userId: string) {
    return this.adminService.setUserBlockedState(userId, true);
  }

  @Post('users/:id/unblock')
  unblockUser(@Param('id') userId: string) {
    return this.adminService.setUserBlockedState(userId, false);
  }

  @Get('properties/moderation/queue')
  getModerationQueue(@Query() query: ModerationQueueQueryDto) {
    return this.adminService.getModerationQueue(query);
  }

  @Post('properties/:id/approve')
  approveProperty(@Param('id') propertyId: string) {
    return this.adminService.approveProperty(propertyId);
  }

  @Post('properties/:id/reject')
  rejectProperty(@Param('id') propertyId: string) {
    return this.adminService.rejectProperty(propertyId);
  }

  @Post('properties/:id/flag')
  flagProperty(@Param('id') propertyId: string, @Body() body: FlagPropertyDto) {
    return this.adminService.flagProperty(propertyId, body.reason);
  }

  @Post('properties/moderation/bulk')
  bulkModerate(@Body() body: BulkModerationDto, @CurrentUser() _user: AuthUserPayload) {
    return this.adminService.bulkModerate(body);
  }

  @Get('transactions/monitoring')
  monitorTransactions(@Query() query: TransactionMonitoringQueryDto) {
    return this.adminService.monitorTransactions(query);
  }

  @Get('transactions/monitoring/summary')
  monitorTransactionsSummary() {
    return this.adminService.transactionMonitoringSummary();
  }

  @Get('fraud/alerts')
  listFraudAlerts(@Query() query: FraudAlertsQueryDto) {
    return this.adminService.listFraudAlerts(query);
  }

  @Get('fraud/alerts/summary')
  getFraudAlertsSummary() {
    return this.adminService.getFraudAlertsSummary();
  }

  @Get('fraud/alerts/:id')
  getFraudAlertDetails(@Param('id') alertId: string) {
    return this.adminService.getFraudAlertDetails(alertId);
  }

  @Patch('fraud/alerts/:id')
  reviewFraudAlert(
    @Param('id') alertId: string,
    @Body() payload: ReviewFraudAlertDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.adminService.reviewFraudAlert(alertId, payload, user.sub);
  }

  @Post('fraud/alerts/:id/notes')
  addFraudAlertNote(
    @Param('id') alertId: string,
    @Body() payload: AddFraudInvestigationNoteDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.adminService.addFraudAlertNote(alertId, payload, user.sub);
  }

  @Post('fraud/alerts/:id/block-user')
  blockFraudUser(
    @Param('id') alertId: string,
    @Body() payload: BlockFraudUserDto,
    @CurrentUser() user: AuthUserPayload,
  ) {
    return this.adminService.blockFraudUser(alertId, user.sub, payload);
  }

  @Post('fraud/users/:id/scan')
  scanUserForFraud(@Param('id') userId: string, @CurrentUser() user: AuthUserPayload) {
    return this.adminService.scanUserForFraud(userId, user.sub);
  }

  @Post('fraud/properties/:id/scan')
  scanPropertyForFraud(@Param('id') propertyId: string, @CurrentUser() user: AuthUserPayload) {
    return this.adminService.scanPropertyForFraud(propertyId, user.sub);
  }
}

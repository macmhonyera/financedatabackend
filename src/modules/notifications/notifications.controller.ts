import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { NotificationsService } from './notifications.service';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import { EnqueueNotificationDto } from './dto/enqueue-notification.dto';
import { ProcessNotificationsDto } from './dto/process-notifications.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get('templates')
  @ApiOperation({ summary: 'List notification templates' })
  listTemplates(@Query('includeInactive') includeInactive?: string) {
    return this.svc.listTemplates(includeInactive !== 'false');
  }

  @Post('templates')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create notification template (admin/manager)' })
  createTemplate(@Body() dto: CreateNotificationTemplateDto) {
    return this.svc.createTemplate(dto);
  }

  @Patch('templates/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update notification template (admin/manager)' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.svc.updateTemplate(id, dto);
  }

  @Post('enqueue')
  @ApiOperation({ summary: 'Queue a notification for delivery' })
  @ApiResponse({ status: 201, description: 'Notification queued' })
  enqueue(@Body() dto: EnqueueNotificationDto) {
    return this.svc.enqueue(dto);
  }

  @Post('process')
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Process pending notifications (admin/manager)' })
  process(@Body() dto: ProcessNotificationsDto) {
    return this.svc.processPending(dto.limit || 50);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List notifications (admin/manager)' })
  list(@Query('status') status?: string, @Query('recipientId') recipientId?: string, @Query('channel') channel?: string) {
    return this.svc.listNotifications({ status, recipientId, channel });
  }

  @Get('my')
  @ApiOperation({ summary: 'List my in-app notifications' })
  myNotifications(@Req() req: any) {
    return this.svc.getMyInApp(req.user);
  }
}

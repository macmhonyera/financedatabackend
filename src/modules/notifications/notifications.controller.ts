import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { NotificationsService } from './notifications.service';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import { EnqueueNotificationDto } from './dto/enqueue-notification.dto';
import { ProcessNotificationsDto } from './dto/process-notifications.dto';
import { Observable } from 'rxjs';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get('templates')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List notification templates' })
  listTemplates(@Query('includeInactive') includeInactive?: string) {
    return this.svc.listTemplates(includeInactive !== 'false');
  }

  @Post('templates')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Create notification template (admin/manager)' })
  createTemplate(@Body() dto: CreateNotificationTemplateDto) {
    return this.svc.createTemplate(dto);
  }

  @Patch('templates/:id')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Update notification template (admin/manager)' })
  updateTemplate(@Param('id') id: string, @Body() dto: UpdateNotificationTemplateDto) {
    return this.svc.updateTemplate(id, dto);
  }

  @Post('enqueue')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Queue a notification for delivery' })
  @ApiResponse({ status: 201, description: 'Notification queued' })
  enqueue(@Body() dto: EnqueueNotificationDto) {
    return this.svc.enqueue(dto);
  }

  @Post('process')
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'Process pending notifications (admin/manager)' })
  process(@Body() dto: ProcessNotificationsDto) {
    return this.svc.processPending(dto.limit || 50);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'))
  @UseGuards(RolesGuard)
  @Roles('admin', 'manager')
  @ApiOperation({ summary: 'List notifications (admin/manager)' })
  list(@Query('status') status?: string, @Query('recipientId') recipientId?: string, @Query('channel') channel?: string) {
    return this.svc.listNotifications({ status, recipientId, channel });
  }

  @Get('my')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'List my in-app notifications' })
  myNotifications(@Req() req: any) {
    return this.svc.getMyInApp(req.user);
  }

  @Get('my/unread-count')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Count my unread in-app notifications' })
  myUnreadCount(@Req() req: any) {
    return this.svc.getMyInAppUnreadCount(req.user);
  }

  @Post('my/read-all')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Mark all my in-app notifications as read' })
  markAllMyRead(@Req() req: any) {
    return this.svc.markAllMyInAppRead(req.user);
  }

  @Patch(':id/read')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Mark one of my in-app notifications as read' })
  markRead(@Req() req: any, @Param('id') id: string) {
    return this.svc.markMyInAppNotificationRead(id, req.user);
  }

  @Sse('stream')
  @ApiOperation({ summary: 'Realtime notification stream for header counter updates' })
  stream(@Req() req: any, @Query('token') token?: string): Observable<MessageEvent> {
    const user = this.svc.resolveStreamUser(req, token);
    return this.svc.subscribeToMyNotificationStream(user.id);
  }
}

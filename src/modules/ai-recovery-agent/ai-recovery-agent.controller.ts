import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AiRecoveryAgentService } from './ai-recovery-agent.service';

@ApiTags('ai-recovery-agent')
@Controller()
export class AiRecoveryAgentController {
  constructor(private readonly service: AiRecoveryAgentService) {}

  @Get('whatsapp/webhook')
  @ApiOperation({ summary: 'Meta WhatsApp webhook verification challenge' })
  @ApiResponse({ status: 200, description: 'Webhook challenge response' })
  verifyWebhook(@Query() query: Record<string, any>) {
    return this.service.validateWebhookChallenge(query);
  }

  @Post('whatsapp/webhook')
  @ApiOperation({ summary: 'Receive inbound WhatsApp messages for AI recovery workflows' })
  @ApiResponse({ status: 201, description: 'Webhook processed and AI response generated' })
  webhook(@Req() req: any, @Body() body: Record<string, any>) {
    return this.service.handleWebhookMessage(req, body);
  }

  @Get('ai-recovery-agent/dashboard')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager', 'loan_officer', 'collector')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recovery dashboard summary' })
  dashboard(@Req() req: any) {
    return this.service.getRecoveryDashboard(req.user);
  }

  @Get('ai-recovery-agent/overdue-borrowers')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager', 'loan_officer', 'collector')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List overdue borrowers with risk scores' })
  overdueBorrowers(@Req() req: any) {
    return this.service.listOverdueBorrowers(req.user);
  }

  @Get('ai-recovery-agent/borrowers/:borrowerId/conversation')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager', 'loan_officer', 'collector')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Borrower conversation and recovery history' })
  borrowerConversation(@Req() req: any, @Param('borrowerId') borrowerId: string) {
    return this.service.getBorrowerConversation(borrowerId, req.user);
  }

  @Get('ai-recovery-agent/borrowers/:borrowerId/promises')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager', 'loan_officer', 'collector')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Borrower payment promises' })
  borrowerPromises(@Req() req: any, @Param('borrowerId') borrowerId: string) {
    return this.service.getBorrowerPromises(borrowerId, req.user);
  }

  @Get('ai-recovery-agent/escalations')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager', 'loan_officer', 'collector')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Escalation alerts for high-risk accounts' })
  escalations(@Req() req: any, @Query('limit') limit?: string) {
    return this.service.getEscalations(req.user, Number(limit || 100));
  }

  @Post('ai-recovery-agent/process-reminders')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('admin', 'manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually trigger daily reminder sweep' })
  processReminders() {
    return this.service.runDailyReminderSweep();
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AiRecoveryAgentService } from './ai-recovery-agent.service';

@Injectable()
export class AiRecoveryAgentProcessor {
  private readonly logger = new Logger(AiRecoveryAgentProcessor.name);

  constructor(private readonly service: AiRecoveryAgentService) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async runDailyReminderSweep() {
    try {
      const summary = await this.service.runDailyReminderSweep();
      this.logger.log(
        `Daily reminder sweep completed: evaluated=${summary.evaluatedLoans}, reminders=${summary.remindersSent}, escalations=${summary.escalations}, failures=${summary.failures}, skipped=${summary.skipped}`,
      );
    } catch (error: any) {
      this.logger.error(`Daily reminder sweep failed: ${error?.message || error}`);
    }
  }
}

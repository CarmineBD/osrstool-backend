import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { FeedbackStatus, FeedbackType } from './feedback.enums';

const FEEDBACK_NOTIFICATION_RECIPIENT = 'feedback@rsmethods.com';

interface FeedbackNotification {
  id: string;
  type: FeedbackType;
  content: string;
  status: FeedbackStatus;
  createdAt: Date;
  createdBy: {
    id: string;
    username: string;
  };
}

@Injectable()
export class FeedbackNotificationService {
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  assertConfigured(): void {
    this.getSmtpConfig();
  }

  async sendNewFeedback(feedback: FeedbackNotification): Promise<void> {
    const smtp = this.getSmtpConfig();
    const transporter = this.transporter ?? this.createTransporter(smtp);

    await transporter.sendMail({
      from: smtp.from,
      to: FEEDBACK_NOTIFICATION_RECIPIENT,
      subject: `[RS Methods] New ${feedback.type} feedback`,
      text: [
        'A new feedback item has been submitted.',
        '',
        `ID: ${feedback.id}`,
        `Type: ${feedback.type}`,
        `Status: ${feedback.status}`,
        `Created at: ${feedback.createdAt.toISOString()}`,
        `Created by: ${feedback.createdBy.username} (${feedback.createdBy.id})`,
        '',
        'Content:',
        feedback.content,
      ].join('\n'),
    });
  }

  private createTransporter(smtp: SmtpConfig): Transporter {
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.password,
      },
    });
    return this.transporter;
  }

  private getSmtpConfig(): SmtpConfig {
    const host = this.config.get<string>('SMTP_HOST')?.trim();
    const user = this.config.get<string>('SMTP_USER')?.trim();
    const password = this.config.get<string>('SMTP_PASSWORD');
    const from = this.config.get<string>('SMTP_FROM')?.trim();
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);

    if (
      !host ||
      !user ||
      !password ||
      !from ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    ) {
      throw new ServiceUnavailableException({
        code: 'FEEDBACK_SMTP_CONFIG_MISSING',
        message: 'Feedback notification email is not configured',
      });
    }

    return {
      host,
      user,
      password,
      from,
      port,
      secure: this.parseBoolean(this.config.get<string>('SMTP_SECURE'), port === 465),
    };
  }

  private parseBoolean(value: string | undefined, fallback: boolean): boolean {
    if (!value) {
      return fallback;
    }

    return value.trim().toLowerCase() === 'true' || value.trim() === '1';
  }
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

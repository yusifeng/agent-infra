import { Resend } from 'resend';

export type SendSignupCodeEmailInput = {
  toEmail: string;
  code: string;
  expiresInMinutes: number;
};

export type SendPasswordResetCodeEmailInput = {
  toEmail: string;
  code: string;
  expiresInMinutes: number;
};

export interface AuthEmailSender {
  sendSignupCodeEmail(input: SendSignupCodeEmailInput): Promise<void>;
  sendPasswordResetCodeEmail(input: SendPasswordResetCodeEmailInput): Promise<void>;
}

class MissingAuthEmailSender implements AuthEmailSender {
  async sendSignupCodeEmail() {
    throw new Error('auth email sender is not configured');
  }

  async sendPasswordResetCodeEmail() {
    throw new Error('auth email sender is not configured');
  }
}

export class ResendAuthEmailSender implements AuthEmailSender {
  constructor(
    private readonly resend: Resend,
    private readonly options: { fromEmail: string }
  ) {}

  async sendSignupCodeEmail(input: SendSignupCodeEmailInput) {
    const result = await this.resend.emails.send({
      from: this.options.fromEmail,
      to: input.toEmail,
      subject: 'Your sign-up verification code',
      text: `Your verification code is ${input.code}. It expires in ${input.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  async sendPasswordResetCodeEmail(input: SendPasswordResetCodeEmailInput) {
    const result = await this.resend.emails.send({
      from: this.options.fromEmail,
      to: input.toEmail,
      subject: 'Your password reset verification code',
      text: `Your password reset code is ${input.code}. It expires in ${input.expiresInMinutes} minutes. If you did not request this, you can ignore this email.`
    });

    if (result.error) {
      throw new Error(result.error.message);
    }
  }
}

export function createAuthEmailSenderFromEnv(): AuthEmailSender {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.AUTH_EMAIL_FROM?.trim();

  if (!apiKey || !fromEmail) {
    return new MissingAuthEmailSender();
  }

  return new ResendAuthEmailSender(new Resend(apiKey), { fromEmail });
}

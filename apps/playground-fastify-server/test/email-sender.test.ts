import { describe, expect, it } from 'vitest';

import { ResendAuthEmailSender } from '../src/features/auth/service/email-sender.js';

describe('ResendAuthEmailSender', () => {
  it('throws when resend returns an error payload without throwing', async () => {
    const resend = {
      emails: {
        async send() {
          return {
            data: null,
            error: {
              message: 'delivery failed'
            }
          };
        }
      }
    };

    const sender = new ResendAuthEmailSender(resend as never, {
      fromEmail: 'noreply@example.com'
    });

    await expect(
      sender.sendSignupCodeEmail({
        toEmail: 'user@example.com',
        code: '123456',
        expiresInMinutes: 10
      })
    ).rejects.toThrow('delivery failed');
  });
});

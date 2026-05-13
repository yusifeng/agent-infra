import crypto from 'node:crypto';

export const EMAIL_CHALLENGE_CODE_LENGTH = 6;

export function createEmailChallengeCode(randomInt: (maxExclusive: number) => number = crypto.randomInt) {
  return String(randomInt(10 ** EMAIL_CHALLENGE_CODE_LENGTH)).padStart(EMAIL_CHALLENGE_CODE_LENGTH, '0');
}

export function hashEmailChallengeCode(input: {
  challengeId: string;
  emailNormalized: string;
  purpose: string;
  code: string;
  secret: string;
}) {
  return crypto
    .createHmac('sha256', input.secret)
    .update(`${input.challengeId}:${input.emailNormalized}:${input.purpose}:${input.code}`)
    .digest('hex');
}

import { useEffect, useState } from 'react';

function computeRemainingSeconds(cooldownEndsAt: number) {
  return Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000));
}

export function useEmailCodeCooldown(durationSeconds: number) {
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (!cooldownEndsAt) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemainingSeconds = () => {
      const nextRemainingSeconds = computeRemainingSeconds(cooldownEndsAt);
      setRemainingSeconds(nextRemainingSeconds);

      if (nextRemainingSeconds === 0) {
        setCooldownEndsAt(null);
      }
    };

    updateRemainingSeconds();
    const intervalId = window.setInterval(updateRemainingSeconds, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [cooldownEndsAt]);

  return {
    remainingSeconds,
    isCooldownActive: remainingSeconds > 0,
    startCooldown() {
      const nextCooldownEndsAt = Date.now() + durationSeconds * 1000;
      setCooldownEndsAt(nextCooldownEndsAt);
      setRemainingSeconds(durationSeconds);
    }
  };
}

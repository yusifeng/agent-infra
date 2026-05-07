import clsx from 'clsx';
import { useState } from 'react';

function buildSiteIconUrl(hostname: string) {
  return `/site-icons/${encodeURIComponent(hostname)}`;
}

export function SiteIconBadge({
  hostname,
  label,
  className,
  fallbackClassName
}: {
  hostname: string;
  label: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const normalizedLabel = label.trim();
  const fallbackText = (normalizedLabel.slice(0, 1) || hostname.slice(0, 1) || '?').toUpperCase();

  if (failed || !hostname) {
    return (
      <span
        className={clsx(
          'flex items-center justify-center rounded-full text-[11px] font-semibold shadow-sm',
          fallbackClassName,
          className
        )}
        aria-label={normalizedLabel || hostname}
        title={normalizedLabel || hostname}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <img
      src={buildSiteIconUrl(hostname)}
      alt={normalizedLabel || hostname}
      title={normalizedLabel || hostname}
      onError={() => setFailed(true)}
      className={clsx('rounded-full object-cover shadow-sm', className)}
    />
  );
}

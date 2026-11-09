import React from 'react';
import { SyncStatus } from '@gitpulse/shared';
import { getSyncBadgeStyle } from '../presentation';

interface SyncBadgeProps {
  status: SyncStatus;
}

export const SyncBadge: React.FC<SyncBadgeProps> = ({ status }) => {
  const style = getSyncBadgeStyle(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${style.bgClass} ${style.textClass}`}
      title={`Sync State: ${status}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {style.label}
    </span>
  );
};


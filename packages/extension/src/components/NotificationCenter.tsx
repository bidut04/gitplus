import React from 'react';
import { NotificationRecord } from '@gitpulse/shared';

interface NotificationCenterProps {
  notifications: NotificationRecord[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead
}) => {
  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-zinc-100">Notification Center</h3>
          {unreadCount > 0 && (
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-bold">
              {unreadCount} unread
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={onMarkAllAsRead}
            className="text-xs text-zinc-400 hover:text-emerald-400 transition"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2.5 max-h-96 overflow-y-auto pr-1">
        {notifications.length === 0 ? (
          <p className="text-zinc-500 text-xs py-4 text-center">No notifications yet. You're up to speed!</p>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => onMarkAsRead(n.id)}
              className={`p-3 rounded-lg border transition cursor-pointer ${n.isRead
                  ? 'bg-zinc-900/60 border-zinc-800/60 text-zinc-400'
                  : 'bg-zinc-800/40 border-zinc-700/80 text-zinc-200 hover:border-zinc-600'
                }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold">{n.title}</span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${n.priority === 'CRITICAL'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : n.priority === 'HIGH'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-zinc-700/50 text-zinc-400'
                    }`}
                >
                  {n.priority}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{n.message}</p>
              <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 font-mono">
                <span>{n.repoFullName} : {n.branchName}</span>
                <span>{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};


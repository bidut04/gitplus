import React, { useState } from 'react';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';
import { RepositoryDashboard } from './components/RepositoryDashboard';
import { NotificationCenter } from './components/NotificationCenter';
import { MorningSyncReportModal, MorningReportRepoItem } from './components/MorningSyncReportModal';

export const App: React.FC = () => {
  const [isMorningReportOpen, setIsMorningReportOpen] = useState(false);
  const [repositories, setRepositories] = useState<MorningReportRepoItem[]>([
    {
      id: 'repo-1',
      repository: 'fleet-management-backend',
      branch: 'dev',
      trackingBranch: 'origin/dev',
      behind: 5,
      ahead: 0,
      workingTreeClean: true,
      status: SyncStatus.BEHIND,
      recommendation: RecommendationAction.SAFE_PULL,
      isSafeToPull: true
    },
    {
      id: 'repo-2',
      repository: 'fleet-management-frontend',
      branch: 'main',
      trackingBranch: 'origin/main',
      behind: 0,
      ahead: 0,
      workingTreeClean: true,
      status: SyncStatus.UP_TO_DATE,
      recommendation: RecommendationAction.UP_TO_DATE,
      isSafeToPull: false
    },
    {
      id: 'repo-3',
      repository: 'queue-flow-service',
      branch: 'feature/auth',
      trackingBranch: 'origin/feature/auth',
      behind: 3,
      ahead: 2,
      workingTreeClean: false,
      status: SyncStatus.DIRTY,
      recommendation: RecommendationAction.INSPECT_LOCAL_CHANGES,
      isSafeToPull: false
    }
  ]);

  const [notifications, setNotifications] = useState<any[]>([
    {
      id: 'notif-1',
      userId: 'user-1',
      repositoryId: 'repo-1',
      repoFullName: 'org/fleet-management-backend',
      branchName: 'dev',
      notificationType: 'NEW_COMMITS_AVAILABLE',
      priority: 'HIGH',
      title: 'New changes available on dev',
      message: 'Alice pushed 5 commits to org/fleet-management-backend:dev.',
      isRead: false,
      createdAt: new Date().toISOString()
    }
  ]);

  const handleMarkAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const handlePullRepo = (repoId: string) => {
    alert(`Safe pull triggered for ${repoId}. Fetching and integrating changes.`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <header className="flex items-center justify-between pb-6 mb-6 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center font-bold text-emerald-400">
            ⚡
          </div>
          <div>
            <h1 className="text-lg font-bold">GitPulse</h1>
            <p className="text-xs text-zinc-400">Stay in sync. Never miss a commit.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-zinc-400">Local Agent Online</span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RepositoryDashboard
            repositories={repositories}
            onOpenMorningReport={() => setIsMorningReportOpen(true)}
            onPullRepo={handlePullRepo}
          />
        </div>
        <div>
          <NotificationCenter
            notifications={notifications}
            onMarkAsRead={handleMarkAsRead}
            onMarkAllAsRead={handleMarkAllRead}
          />
        </div>
      </div>

      <MorningSyncReportModal
        isOpen={isMorningReportOpen}
        onClose={() => setIsMorningReportOpen(false)}
        repositories={repositories}
        onTriggerSync={handlePullRepo}
      />
    </div>
  );
};


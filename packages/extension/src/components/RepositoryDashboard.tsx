import React from 'react';
import { SyncBadge } from './SyncBadge';
import { getActionCTA } from '../presentation';
import { MorningReportRepoItem } from './MorningSyncReportModal';

interface RepositoryDashboardProps {
  repositories: MorningReportRepoItem[];
  onOpenMorningReport: () => void;
  onPullRepo: (repoId: string) => void;
}

export const RepositoryDashboard: React.FC<RepositoryDashboardProps> = ({
  repositories,
  onOpenMorningReport,
  onPullRepo
}) => {
  const total = repositories.length;
  const upToDate = repositories.filter(r => r.status === 'UP_TO_DATE').length;
  const outdated = repositories.filter(r => r.behind > 0).length;
  const diverged = repositories.filter(r => r.status === 'DIVERGED').length;

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <span className="text-xs text-zinc-400">Total Monitored</span>
          <p className="text-2xl font-bold text-zinc-100 mt-1">{total}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <span className="text-xs text-emerald-400">Up to Date</span>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{upToDate}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <span className="text-xs text-amber-400">Outdated / Behind</span>
          <p className="text-2xl font-bold text-amber-400 mt-1">{outdated}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
          <span className="text-xs text-purple-400">Diverged</span>
          <p className="text-2xl font-bold text-purple-400 mt-1">{diverged}</p>
        </div>
      </div>

      {/* Main Repository List */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h3 className="font-semibold text-zinc-100">Monitored Repositories</h3>
            <p className="text-xs text-zinc-400">Live local working state synced via GitPulse Local Agent</p>
          </div>
          <button
            onClick={onOpenMorningReport}
            className="px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-500/20 text-xs font-semibold rounded-lg transition"
          >
            ⚡ View Morning Report
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {repositories.map(repo => {
            const cta = getActionCTA(repo.recommendation, repo.isSafeToPull);
            return (
              <div
                key={repo.id}
                className="flex items-center justify-between p-4 bg-zinc-800/30 border border-zinc-800/80 rounded-xl hover:border-zinc-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-100">{repo.repository}</span>
                    <SyncBadge status={repo.status} />
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
                    <span>branch: <strong className="text-zinc-200">{repo.branch}</strong></span>
                    <span>behind: <strong className="text-amber-400">{repo.behind}</strong></span>
                    <span>ahead: <strong className="text-blue-400">{repo.ahead}</strong></span>
                    <span>
                      tree: {repo.workingTreeClean ? (
                        <span className="text-emerald-400">Clean</span>
                      ) : (
                        <span className="text-orange-400">Dirty</span>
                      )}
                    </span>
                  </div>
                </div>

                <button
                  disabled={!cta.isEnabled}
                  title={cta.tooltip}
                  onClick={() => onPullRepo(repo.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${cta.isEnabled
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-lg shadow-emerald-900/20'
                      : 'bg-zinc-800/80 text-zinc-500 cursor-not-allowed'
                    }`}
                >
                  {cta.buttonText}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};


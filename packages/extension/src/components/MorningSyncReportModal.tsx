import React from 'react';
import { SyncStatus, RecommendationAction } from '@gitpulse/shared';
import { SyncBadge } from './SyncBadge';
import { getActionCTA } from '../presentation';

export interface MorningReportRepoItem {
  id: string;
  repository: string;
  branch: string;
  trackingBranch?: string | null;
  behind: number;
  ahead: number;
  workingTreeClean: boolean;
  status: SyncStatus;
  recommendation: RecommendationAction;
  isSafeToPull: boolean;
}

interface MorningSyncReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositories: MorningReportRepoItem[];
  onTriggerSync?: (repoId: string) => void;
}

export const MorningSyncReportModal: React.FC<MorningSyncReportModalProps> = ({
  isOpen,
  onClose,
  repositories,
  onTriggerSync
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-w-4xl w-full p-6 text-zinc-100">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="text-emerald-400">⚡</span> Morning Synchronization Report
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Inspected local clones vs. remote tracking branches before you start coding.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 text-sm px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 transition"
          >
            ✕ Close
          </button>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wider">
                <th className="py-3 px-3">Repository</th>
                <th className="py-3 px-3">Branch</th>
                <th className="py-3 px-3 text-center">Behind</th>
                <th className="py-3 px-3 text-center">Ahead</th>
                <th className="py-3 px-3">Working Tree</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Recommended Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {repositories.map((repo) => {
                const cta = getActionCTA(repo.recommendation, repo.isSafeToPull);
                return (
                  <tr key={repo.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 px-3 font-medium font-sans text-zinc-200">{repo.repository}</td>
                    <td className="py-3 px-3 text-zinc-300">{repo.branch}</td>
                    <td className="py-3 px-3 text-center font-bold text-amber-400">{repo.behind}</td>
                    <td className="py-3 px-3 text-center font-bold text-blue-400">{repo.ahead}</td>
                    <td className="py-3 px-3 font-sans">
                      {repo.workingTreeClean ? (
                        <span className="text-emerald-400">Clean</span>
                      ) : (
                        <span className="text-orange-400 font-semibold">Dirty (Modified)</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-sans">
                      <SyncBadge status={repo.status} />
                    </td>
                    <td className="py-3 px-3 text-right font-sans">
                      <button
                        disabled={!cta.isEnabled}
                        title={cta.tooltip}
                        onClick={() => onTriggerSync?.(repo.id)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition ${cta.isEnabled
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          }`}
                      >
                        {cta.buttonText}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};


// What the status line says about uncommitted and unpushed changes in the memory repository.

/** Changes in the memory repository; `unpushed` is absent when the branch has no upstream. */
export type MemoryGit = { uncommitted: number; unpushed?: number }

// Counts the entries of `git status --porcelain` and the number `git rev-list --count @{u}..HEAD` prints.
// `ahead` is undefined when that command failed, i.e. there is no upstream:
// { porcelain: '', ahead: '0\n' } → { uncommitted: 0, unpushed: 0 }
// { porcelain: ' M memory/team/MEMORY.md\n?? memory/users/octocat/candidates.md\n', ahead: '0\n' } → { uncommitted: 2, unpushed: 0 }
// { porcelain: '', ahead: '2\n' } → { uncommitted: 0, unpushed: 2 }
// { porcelain: '', ahead: undefined } → { uncommitted: 0 }
// { porcelain: '', ahead: 'oops' } → { uncommitted: 0 }
export const parseMemoryGit = ({ porcelain, ahead }: { porcelain: string; ahead?: string }): MemoryGit => {
  const count = Number.parseInt((ahead || '').trim(), 10)
  return {
    uncommitted: porcelain.split('\n').filter(line => line.trim() !== '').length,
    ...(Number.isNaN(count) ? {} : { unpushed: count }),
  }
}

// The status line's git parts; zero counts and an unknown count are left out:
// { uncommitted: 1, unpushed: 2 } → ' · 1 uncommitted · 2 unpushed'
// { uncommitted: 0, unpushed: 0 } → ''
// { uncommitted: 3 } → ' · 3 uncommitted'
// undefined → ''
export const describeMemoryGit = ({ git }: { git?: MemoryGit }): string =>
  [
    git?.uncommitted ? ` · ${git.uncommitted} uncommitted` : '',
    git?.unpushed ? ` · ${git.unpushed} unpushed` : '',
  ].join('')

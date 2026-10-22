/**
 * Chooses the pull request that a commit landed through.
 */

/**
 * @typedef {{ number: number, title: string, merge_commit_sha?: string | null, merged_at?: string | null }} PullSummary
 */

/**
 * The commits/{sha}/pulls API can return open PRs too, so prefer the PR whose merge commit is this sha,
 * then any merged PR, and otherwise nothing.
 * @param {string} sha
 * @param {PullSummary[]} pulls
 * @returns {{ number: number, title: string } | null}
 */
export function pickPr(sha, pulls) {
    const pull =
        pulls.find((candidate) => candidate.merge_commit_sha === sha) ?? pulls.find((candidate) => candidate.merged_at);
    return pull ? { number: pull.number, title: pull.title } : null;
}

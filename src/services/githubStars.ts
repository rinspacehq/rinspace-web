const githubOrganizationRepositoriesEndpoint =
  'https://api.github.com/orgs/rinspacehq/repos?type=public&per_page=100';

type GithubRepository = {
  stargazers_count: number;
};

function parseRepository(value: unknown): GithubRepository | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.stargazers_count !== 'number'
  ) return null;
  return {
    stargazers_count: candidate.stargazers_count,
  };
}

export async function loadRinspaceOpenSourceStars(signal?: AbortSignal): Promise<number> {
  const response = await fetch(githubOrganizationRepositoriesEndpoint, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal,
  });
  if (!response.ok) throw new Error(`GitHub repository request failed: ${response.status}`);

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error('GitHub repository response is invalid.');

  return payload.reduce((total, value) => {
    const repository = parseRepository(value);
    if (!repository) return total;
    return total + Math.max(0, repository.stargazers_count);
  }, 0);
}

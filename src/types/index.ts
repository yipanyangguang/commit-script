export interface CommitInfo {
  date: string;
  hash: string;
  author: string;
  message: string;
  branch: string;
  repo_name: string;
}

export interface RepoItem {
  path: string;
}

export interface RepoGroup {
  id: string;
  name: string;
  selected: boolean;
  repos: RepoItem[];
}

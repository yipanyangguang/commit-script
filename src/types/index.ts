export interface CommitInfo {
  date: string;
  hash: string;
  author: string;
  message: string;
  branch: string;
  repo_name: string;
  insertions: number;
  deletions: number;
  timestamp: number;
}

export interface RepoItem {
  path: string;
  hasUpdates?: boolean; // 是否有更新
  lastChecked?: number; // 上次检查时间戳
  remoteUrl?: string; // 远程仓库地址
}

export interface RepoGroup {
  id: string;
  name: string;
  selected: boolean;
  repos: RepoItem[];
  lastChecked?: number; // 上次检查时间戳
}

export interface AuthorAlias {
  id: string;
  original: string;
  alias: string;
}

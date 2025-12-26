import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Tabs, message, Typography, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import type { TabsProps } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import "dayjs/locale/zh-cn";
import "./App.css";

dayjs.locale("zh-cn");

import { RepoConfig } from "./components/RepoConfig";
import { BasicConfig } from "./components/BasicConfig";
import { AliasConfig } from "./components/AliasConfig";
import { PreviewExport } from "./components/PreviewExport";
import { Dashboard } from "./components/Dashboard";
import { About } from "./components/About";
import type { CommitInfo, RepoGroup, RepoItem, AuthorAlias } from "./types";

const { Title } = Typography;

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function App() {
  // State
  const [activeTab, setActiveTab] = useState("1");
  const [repoGroups, setRepoGroups] = useState<RepoGroup[]>(() => {
    const saved = localStorage.getItem("repoGroups");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse repoGroups", e);
      }
    }

    // Migration from old repoPaths
    const oldSaved = localStorage.getItem("repoPaths");
    if (oldSaved) {
      try {
        const parsed = JSON.parse(oldSaved);
        let initialRepos: RepoItem[] = [];
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === "string") {
            initialRepos = parsed.map((path: string) => ({
              path,
            }));
          } else {
            initialRepos = parsed;
          }
        }
        if (initialRepos.length > 0) {
          return [
            {
              id: "default",
              name: "默认分组",
              selected: true,
              repos: initialRepos,
            },
          ];
        }
      } catch (e) {
        console.error("Failed to parse old repoPaths", e);
      }
    }

    return [
      {
        id: "default",
        name: "默认分组",
        selected: true,
        repos: [],
      },
    ];
  });

  useEffect(() => {
    localStorage.setItem("repoGroups", JSON.stringify(repoGroups));
  }, [repoGroups]);

  const [authorAliases, setAuthorAliases] = useState<AuthorAlias[]>(() => {
    const saved = localStorage.getItem("authorAliases");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse authorAliases", e);
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem("authorAliases", JSON.stringify(authorAliases));
  }, [authorAliases]);

  async function checkGroupStatus(groupId: string) {
    if (checkingGroupId) return;
    setCheckingGroupId(groupId);
    const msgKey = `check_status_${groupId}`;
    message.loading({ content: "正在准备检查...", key: msgKey, duration: 0 });

    const group = repoGroups.find((g) => g.id === groupId);
    if (!group) {
      setCheckingGroupId(null);
      return;
    }

    const total = group.repos.length;
    let checkedCount = 0;
    const results = new Map<string, { hasUpdates: boolean; remoteUrl: string }>();

    for (const repo of group.repos) {
      const repoName = repo.path.split(/[/\\]/).pop();
      message.loading({
        content: `正在检查 (${checkedCount + 1}/${total}): ${repoName}`,
        key: msgKey,
        duration: 0,
      });
      try {
        const hasUpdates = await invoke<boolean>("git_check_updates", {
          repoPath: repo.path,
        });

        // Try to fetch remote URL if missing or just to be sure
        let remoteUrl = repo.remoteUrl;
        try {
          const url = await invoke<string>("git_get_remote_url", {
            repoPath: repo.path,
          });
          if (url) remoteUrl = url;
        } catch (e) {
          // ignore error if remote url cannot be fetched
        }

        results.set(repo.path, { hasUpdates, remoteUrl: remoteUrl || "" });
      } catch (e) {
        console.warn(`Check updates failed for ${repo.path}:`, e);
      }
      checkedCount++;
    }

    setRepoGroups((prev) => {
      return prev.map((g) => {
        if (g.id !== groupId) return g;

        const updatedRepos = g.repos.map((repo) => {
          const res = results.get(repo.path);
          if (res) {
            if (
              repo.hasUpdates !== res.hasUpdates ||
              repo.remoteUrl !== res.remoteUrl
            ) {
              return { ...repo, ...res, lastChecked: Date.now() };
            }
          }
          return repo;
        });

        return { ...g, repos: updatedRepos, lastChecked: Date.now() };
      });
    });

    setCheckingGroupId(null);
    message.success({ content: "该组状态检查完成", key: msgKey, duration: 2 });
  }

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("week").add(1, "day"), // Monday
    dayjs().endOf("week").add(1, "day"), // Sunday
  ]);
  const [authorMode, setAuthorMode] = useState<"all" | "specific">("all");
  const [includeAuthors, setIncludeAuthors] = useState<string[]>([]);
  const [excludeAuthors, setExcludeAuthors] = useState<string[]>([]);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingGroupId, setCheckingGroupId] = useState<string | null>(null);

  // Preview Filters
  const [previewAuthor, setPreviewAuthor] = useState<string>("all");
  const [previewRepo, setPreviewRepo] = useState<string>("all");

  // Actions
  async function addRepo(groupId: string) {
    const selected = await open({
      directory: true,
      multiple: true,
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      const validPaths: string[] = [];
      const remoteUrls: Record<string, string> = {};

      for (const path of paths) {
        if (path) {
          const isGit = await invoke("check_git_repo", { path });
          if (isGit) {
            validPaths.push(path);
            try {
              const url = await invoke<string>("git_get_remote_url", { repoPath: path });
              remoteUrls[path] = url;
            } catch (e) {
              console.warn(`Failed to get remote url for ${path}:`, e);
            }
          } else {
            message.warning(`警告: ${path} 不是一个 Git 仓库。`);
          }
        }
      }

      setRepoGroups((prev) => {
        return prev.map((group) => {
          if (group.id === groupId) {
            const newItems = validPaths.map((path) => ({
              path,
              remoteUrl: remoteUrls[path] || "",
            }));
            const existingPaths = new Set(group.repos.map((item) => item.path));
            const uniqueNewItems = newItems.filter(
              (item) => !existingPaths.has(item.path)
            );
            return { ...group, repos: [...group.repos, ...uniqueNewItems] };
          }
          return group;
        });
      });
    }
  }

  function removeRepo(groupId: string, path: string) {
    setRepoGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              repos: group.repos.filter((item) => item.path !== path),
            }
          : group
      )
    );
  }

  function addGroup() {
    setRepoGroups((prev) => [
      ...prev,
      {
        id: generateId(),
        name: "新分组",
        selected: true,
        repos: [],
      },
    ]);
  }

  function removeGroup(groupId: string) {
    setRepoGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  async function updateGroup(groupId: string) {
    const group = repoGroups.find((g) => g.id === groupId);
    if (!group) return;

    const reposToUpdate = group.repos.filter((r) => r.hasUpdates);
    if (reposToUpdate.length === 0) {
      message.info("该分组下没有需要更新的仓库。");
      return;
    }

    const msgKey = `update_group_${groupId}`;
    message.loading({ content: "正在更新仓库...", key: msgKey, duration: 0 });

    const fetchedRepos: string[] = [];
    await Promise.all(
      reposToUpdate.map((repo) =>
        invoke("git_fetch", { repoPath: repo.path })
          .then(() => {
            fetchedRepos.push(repo.path);
          })
          .catch((e) => {
            console.warn(`Fetch failed for ${repo.path}: ${e}`);
          })
      )
    );

    if (fetchedRepos.length > 0) {
      setRepoGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                repos: g.repos.map((r) =>
                  fetchedRepos.includes(r.path)
                    ? { ...r, hasUpdates: false, lastChecked: Date.now() }
                    : r
                ),
              }
            : g
        )
      );
      message.success({
        content: `更新完成，成功更新 ${fetchedRepos.length} 个仓库。`,
        key: msgKey,
        duration: 2,
      });
    } else {
      message.warning({
        content: "更新失败，请检查网络或仓库状态。",
        key: msgKey,
        duration: 3,
      });
    }
  }

  function renameGroup(groupId: string, name: string) {
    setRepoGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, name } : g))
    );
  }

  function toggleGroup(groupId: string, checked: boolean) {
    setRepoGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, selected: checked } : g))
    );
  }

  async function startAnalysis() {
    const selectedRepos = repoGroups
      .filter((g) => g.selected)
      .flatMap((g) => g.repos.map((r) => r.path));

    if (selectedRepos.length === 0) {
      message.error("请至少选择一个仓库。");
      return;
    }
    if (!dateRange || !dateRange[0] || !dateRange[1]) {
      message.error("请选择时间范围。");
      return;
    }
    if (authorMode === "specific" && includeAuthors.length === 0 && excludeAuthors.length === 0) {
      message.error("请至少指定一个包含或排除的作者。");
      return;
    }

    setLoading(true);
    const msgKey = "analysis_process";
    try {
      message.loading({ content: "正在检查并拉取最新代码...", key: msgKey, duration: 0 });

      // Filter repos that need update
      const reposToFetch = repoGroups
        .filter((g) => g.selected)
        .flatMap((g) => g.repos)
        .filter((r) => selectedRepos.includes(r.path) && r.hasUpdates !== false) // If undefined or true, try fetch
        .map((r) => r.path);

      if (reposToFetch.length > 0) {
        const fetchedRepos: string[] = [];
        await Promise.all(
          reposToFetch.map((repoPath) =>
            invoke("git_fetch", { repoPath })
              .then(() => {
                fetchedRepos.push(repoPath);
              })
              .catch((e) => {
                console.warn(`Fetch failed for ${repoPath}: ${e}`);
                message.warning(`无法拉取 ${repoPath}，将使用本地数据。`);
              })
          )
        );

        // Update repo status after fetch
        if (fetchedRepos.length > 0) {
          setRepoGroups((prev) =>
            prev.map((group) => ({
              ...group,
              repos: group.repos.map((repo) =>
                fetchedRepos.includes(repo.path)
                  ? { ...repo, hasUpdates: false, lastChecked: Date.now() }
                  : repo
              ),
            }))
          );
        }
      }

      message.loading({ content: "正在分析提交记录...", key: msgKey, duration: 0 });

      const result = await invoke<CommitInfo[]>("get_commits", {
        repoPaths: selectedRepos,
        startDate: dateRange[0].format("YYYY-MM-DD"),
        endDate: dateRange[1].format("YYYY-MM-DD"),
      });

      let filtered = result;
      if (authorMode === "specific") {
        filtered = result.filter((c: CommitInfo) => {
          const authorLower = c.author.toLowerCase();
          
          // 1. Check Include (OR logic)
          // If include list is empty, default to include all (unless excluded)
          let isIncluded = true;
          if (includeAuthors.length > 0) {
            isIncluded = includeAuthors.some(keyword => 
              authorLower.includes(keyword.toLowerCase())
            );
          }

          // 2. Check Exclude (OR logic)
          let isExcluded = false;
          if (excludeAuthors.length > 0) {
            isExcluded = excludeAuthors.some(keyword => 
              authorLower.includes(keyword.toLowerCase())
            );
          }

          return isIncluded && !isExcluded;
        });
      }

      setCommits(filtered);
      message.success({ content: `分析完成，共找到 ${filtered.length} 条提交记录。`, key: msgKey, duration: 2 });
      setActiveTab("3"); // Switch to Preview tab
    } catch (e) {
      message.error({ content: `分析失败: ${e}`, key: msgKey, duration: 3 });
    } finally {
      setLoading(false);
    }
  }

  async function exportReport() {
    if (commits.length === 0) {
      message.warning("没有可导出的记录。");
      return;
    }

    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected && typeof selected === "string") {
      setLoading(true);
      try {
        const commitsToExport = commits.filter((c) => {
          const matchAuthor =
            previewAuthor === "all" || c.author === previewAuthor;
          const matchRepo =
            previewRepo === "all" || c.repo_name === previewRepo;
          return matchAuthor && matchRepo;
        });

        await invoke("export_report", {
          commits: commitsToExport,
          exportPath: selected,
          startDate: dateRange[0].format("YYYY-MM-DD"),
          endDate: dateRange[1].format("YYYY-MM-DD"),
        });
        message.success("导出成功！");
      } catch (e) {
        message.error(`导出失败: ${e}`);
      } finally {
        setLoading(false);
      }
    }
  }

  // Tab Contents
  const items: TabsProps["items"] = [
    {
      key: "1",
      label: "项目配置",
      children: (
        <RepoConfig
          repoGroups={repoGroups}
          addRepo={addRepo}
          removeRepo={removeRepo}
          addGroup={addGroup}
          removeGroup={removeGroup}
          renameGroup={renameGroup}
          toggleGroup={toggleGroup}
          updateGroup={updateGroup}
          checkGroupStatus={checkGroupStatus}
          checkingGroupId={checkingGroupId}
        />
      ),
    },
    {
      key: "2",
      label: "基本配置",
      children: (
        <BasicConfig
          dateRange={dateRange}
          setDateRange={setDateRange}
          authorMode={authorMode}
          setAuthorMode={setAuthorMode}
          includeAuthors={includeAuthors}
          setIncludeAuthors={setIncludeAuthors}
          excludeAuthors={excludeAuthors}
          setExcludeAuthors={setExcludeAuthors}
          authorAliases={authorAliases}
          startAnalysis={startAnalysis}
          loading={loading}
        />
      ),
    },
    {
      key: "3",
      label: "数据概览",
      children: (
        <Dashboard
          commits={commits}
          authorAliases={authorAliases}
          dateRange={dateRange}
        />
      ),
    },
    {
      key: "4",
      label: "预览与导出",
      children: (
        <PreviewExport
          commits={commits}
          previewAuthor={previewAuthor}
          setPreviewAuthor={setPreviewAuthor}
          previewRepo={previewRepo}
          setPreviewRepo={setPreviewRepo}
          exportReport={exportReport}
          authorAliases={authorAliases}
          repoGroups={repoGroups}
        />
      ),
    },
    {
      key: "5",
      label: "别名配置",
      children: (
        <AliasConfig aliases={authorAliases} setAliases={setAuthorAliases} />
      ),
    },
    {
      key: "6",
      label: "说明",
      children: <About />,
    },
  ];

  return (
    <ConfigProvider locale={zhCN}>
      <div className="container">
        <Title level={3} style={{ textAlign: "center", marginBottom: 20 }}>
          Git 提交记录导出工具
        </Title>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={items}
          type="card"
          style={{ flex: 1, display: "flex", flexDirection: "column" }}
        />
      </div>
    </ConfigProvider>
  );
}

export default App;

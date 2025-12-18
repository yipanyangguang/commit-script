import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Tabs, message, Typography } from "antd";
import type { TabsProps } from "antd";
import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import "./App.css";

import { RepoConfig } from "./components/RepoConfig";
import { DateConfig } from "./components/DateConfig";
import { AuthorConfig } from "./components/AuthorConfig";
import { PreviewExport } from "./components/PreviewExport";
import { About } from "./components/About";
import type { CommitInfo, RepoGroup, RepoItem } from "./types";

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

  // Check updates on mount, when repos change, or when switching to config tab
  useEffect(() => {
    if (activeTab !== "1") return; // Only check when on config tab (or initial load if default)

    const checkUpdates = async () => {
      const newGroups = [...repoGroups];
      let changed = false;

      for (const group of newGroups) {
        for (const repo of group.repos) {
          // Only check if not checked recently (e.g., within 5 minutes)
          const now = Date.now();
          if (!repo.lastChecked || now - repo.lastChecked > 5 * 60 * 1000) {
            try {
              const hasUpdates = await invoke<boolean>("git_check_updates", {
                repoPath: repo.path,
              });
              if (repo.hasUpdates !== hasUpdates) {
                repo.hasUpdates = hasUpdates;
                repo.lastChecked = now;
                changed = true;
              }
            } catch (e) {
              console.warn(`Check updates failed for ${repo.path}:`, e);
            }
          }
        }
      }

      if (changed) {
        setRepoGroups(newGroups);
      }
    };

    // Debounce check to avoid too many calls
    const timer = setTimeout(checkUpdates, 1000);
    return () => clearTimeout(timer);
  }, [repoGroups, activeTab]);

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf("week").add(1, "day"), // Monday
    dayjs().endOf("week").add(1, "day"), // Sunday
  ]);
  const [authorMode, setAuthorMode] = useState<"all" | "specific">("all");
  const [specificAuthor, setSpecificAuthor] = useState("");
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);

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

      for (const path of paths) {
        if (path) {
          const isGit = await invoke("check_git_repo", { path });
          if (isGit) {
            validPaths.push(path);
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
    if (authorMode === "specific" && !specificAuthor.trim()) {
      message.error("请输入作者姓名。");
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
        filtered = result.filter((c: CommitInfo) =>
          c.author.toLowerCase().includes(specificAuthor.toLowerCase())
        );
      }

      setCommits(filtered);
      message.success({ content: `分析完成，共找到 ${filtered.length} 条提交记录。`, key: msgKey, duration: 2 });
      setActiveTab("4"); // Switch to Preview tab
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
        />
      ),
    },
    {
      key: "2",
      label: "时间配置",
      children: (
        <DateConfig dateRange={dateRange} setDateRange={setDateRange} />
      ),
    },
    {
      key: "3",
      label: "作者配置",
      children: (
        <AuthorConfig
          authorMode={authorMode}
          setAuthorMode={setAuthorMode}
          specificAuthor={specificAuthor}
          setSpecificAuthor={setSpecificAuthor}
          startAnalysis={startAnalysis}
          loading={loading}
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
        />
      ),
    },
    {
      key: "5",
      label: "说明",
      children: <About />,
    },
  ];

  return (
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
  );
}

export default App;

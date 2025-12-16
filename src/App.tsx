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
import type { CommitInfo } from "./types";

const { Title } = Typography;

function App() {
  // State
  const [activeTab, setActiveTab] = useState("1");
  const [repoPaths, setRepoPaths] = useState<string[]>(() => {
    const saved = localStorage.getItem("repoPaths");
    try {
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to parse repoPaths", e);
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("repoPaths", JSON.stringify(repoPaths));
  }, [repoPaths]);

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
  async function addRepo() {
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

      setRepoPaths((prev: string[]) => [...new Set([...prev, ...validPaths])]);
    }
  }

  function removeRepo(path: string) {
    setRepoPaths((prev: string[]) => prev.filter((p: string) => p !== path));
  }

  async function startAnalysis() {
    if (repoPaths.length === 0) {
      message.error("请至少添加一个仓库。");
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
    try {
      const result = await invoke<CommitInfo[]>("get_commits", {
        repoPaths,
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
      message.success(`分析完成，共找到 ${filtered.length} 条提交记录。`);
      setActiveTab("4"); // Switch to Preview tab
    } catch (e) {
      message.error(`分析失败: ${e}`);
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
          repoPaths={repoPaths}
          addRepo={addRepo}
          removeRepo={removeRepo}
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

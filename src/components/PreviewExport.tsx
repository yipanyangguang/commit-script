import { Button, Select, Space, Table, Modal, Tooltip, message } from "antd";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { GlobalOutlined } from "@ant-design/icons";
import * as Diff2Html from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import type { CommitInfo, AuthorAlias, RepoGroup } from "../types";

interface PreviewExportProps {
  commits: CommitInfo[];
  previewAuthor: string;
  setPreviewAuthor: (author: string) => void;
  previewRepo: string;
  setPreviewRepo: (repo: string) => void;
  exportReport: () => void;
  authorAliases?: AuthorAlias[];
  repoGroups?: RepoGroup[];
}

export function PreviewExport({
  commits,
  previewAuthor,
  setPreviewAuthor,
  previewRepo,
  setPreviewRepo,
  exportReport,
  authorAliases = [],
  repoGroups = [],
}: PreviewExportProps) {
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [diffContent, setDiffContent] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [currentDiffCommit, setCurrentDiffCommit] = useState<CommitInfo | null>(null);

  const getAuthorDisplay = (authorName: string) => {
    const alias = authorAliases.find(
      (a) => a.original.toLowerCase() === authorName.toLowerCase()
    );
    return alias ? alias.alias : authorName;
  };

  const handleViewDiff = async (commit: CommitInfo) => {
    setCurrentDiffCommit(commit);
    setDiffModalVisible(true);
    setDiffLoading(true);
    setDiffContent("");

    try {
      // Find the full path of the repo
      let repoPath = "";
      for (const group of repoGroups) {
        const repo = group.repos.find(r => r.path.endsWith(commit.repo_name) || r.path.split(/[/\\]/).pop() === commit.repo_name);
        if (repo) {
          repoPath = repo.path;
          break;
        }
      }

      if (!repoPath) {
        message.error("找不到仓库路径");
        setDiffLoading(false);
        return;
      }

      const diff = await invoke<string>("get_commit_diff", {
        repoPath,
        hash: commit.hash,
      });
      setDiffContent(diff);
    } catch (e) {
      console.error("Failed to get diff:", e);
      message.error(`获取变更失败: ${e}`);
      setDiffContent("获取变更失败");
    } finally {
      setDiffLoading(false);
    }
  };

  const getRemoteUrl = (repoName: string) => {
    for (const group of repoGroups) {
      const repo = group.repos.find(r => r.path.endsWith(repoName) || r.path.split(/[/\\]/).pop() === repoName);
      if (repo && repo.remoteUrl) {
        return repo.remoteUrl;
      }
    }
    return null;
  };

  const openCommitUrl = async (repoName: string, hash: string) => {
    let url = getRemoteUrl(repoName);
    if (!url) return;

    // Normalize URL
    // git@github.com:user/repo.git -> https://github.com/user/repo
    if (url.startsWith("git@")) {
      url = url.replace(":", "/").replace("git@", "http://");
    }
    if (url.endsWith(".git")) {
      url = url.slice(0, -4);
    }

    // Construct commit URL
    // GitHub/GitLab: /commit/<hash>
    // Bitbucket: /commits/<hash>
    // Azure DevOps: /commit/<hash>
    // Defaulting to /commit/<hash> as it's most common
    const commitUrl = `${url}/commit/${hash}`;
    
    try {
      await open(commitUrl);
    } catch (e) {
      console.error("Failed to open URL:", e);
    }
  };

  const getFilteredCommits = () => {
    return commits.filter((c) => {
      const matchAuthor = previewAuthor === "all" || c.author === previewAuthor;
      const matchRepo = previewRepo === "all" || c.repo_name === previewRepo;
      return matchAuthor && matchRepo;
    });
  };

  return (
    <div className="tab-content">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Space>
          <Select
            value={previewAuthor}
            onChange={setPreviewAuthor}
            style={{ width: 150 }}
            placeholder="筛选作者"
            options={[
              { value: "all", label: "所有作者" },
              ...Array.from(new Set(commits.map((c) => c.author))).map((a) => ({
                value: a,
                label: getAuthorDisplay(a),
              })),
            ]}
          />
          <Select
            value={previewRepo}
            onChange={setPreviewRepo}
            style={{ width: 150 }}
            placeholder="筛选项目"
            options={[
              { value: "all", label: "所有项目" },
              ...Array.from(new Set(commits.map((c) => c.repo_name))).map(
                (r) => ({ value: r, label: r })
              ),
            ]}
          />
        </Space>
        <Button
          type="primary"
          onClick={exportReport}
          disabled={commits.length === 0}
        >
          导出所有数据
        </Button>
      </div>
      <Table
        dataSource={getFilteredCommits()}
        rowKey="hash"
        size="small"
        pagination={{
          defaultPageSize: 20,
          showSizeChanger: true,
          pageSizeOptions: ["10", "20", "50", "100"],
          showTotal: (total) => `共 ${total} 条`,
        }}
        columns={[
          {
            title: "序号",
            key: "index",
            render: (_: unknown, __: CommitInfo, index: number) => index + 1,
            width: 60,
          },
          { title: "日期", dataIndex: "date", width: 110 },
          { 
            title: "项目", 
            dataIndex: "repo_name",
            render: (text: string, record: CommitInfo) => {
              const url = getRemoteUrl(text);
              return (
                <Space>
                  {text}
                  {url && (
                    <Tooltip title="在浏览器中打开">
                      <Button 
                        type="text" 
                        size="small" 
                        icon={<GlobalOutlined />} 
                        onClick={() => openCommitUrl(text, record.hash)}
                        style={{ color: '#1890ff' }}
                      />
                    </Tooltip>
                  )}
                </Space>
              );
            }
          },
          { title: "分支", dataIndex: "branch" },
          { 
            title: "作者", 
            dataIndex: "author",
            render: (text: string) => getAuthorDisplay(text)
          },
          {
            title: "消息",
            dataIndex: "message",
            render: (text: string, record: CommitInfo) => {
              const lines = text.split("\n");
              const title = lines[0];
              const hasMore =
                lines.length > 1 && lines.slice(1).some((l) => l.trim() !== "");

              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span title={title} style={{ marginRight: 8 }}>
                    {title}
                  </span>
                  {hasMore && (
                    <Button
                      size="small"
                      type="link"
                      onClick={() => setSelectedCommit(record)}
                      style={{ padding: 0 }}
                    >
                      更多
                    </Button>
                  )}
                </div>
              );
            },
          },
          {
            title: "操作",
            key: "action",
            width: 100,
            render: (_: unknown, record: CommitInfo) => (
              <Button 
                size="small" 
                onClick={() => handleViewDiff(record)}
              >
                查看变更
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title="Commit 详情"
        open={!!selectedCommit}
        onCancel={() => setSelectedCommit(null)}
        footer={null}
        width={800}
      >
        {selectedCommit && (
          <div>
            <p>
              <strong>项目:</strong> {selectedCommit.repo_name}
            </p>
            <p>
              <strong>作者:</strong> {selectedCommit.author}
            </p>
            <p>
              <strong>日期:</strong> {selectedCommit.date}
            </p>
            <p>
              <strong>Hash:</strong> {selectedCommit.hash}
            </p>
            <div
              style={{
                marginTop: 16,
                whiteSpace: "pre-wrap",
                border: "1px solid #f0f0f0",
                padding: 8,
                borderRadius: 4,
                backgroundColor: "#fafafa",
                maxHeight: "60vh",
                overflowY: "auto",
              }}
            >
              {selectedCommit.message}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={`变更详情 - ${currentDiffCommit?.hash.substring(0, 7)}`}
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        footer={null}
        width="95%"
        centered
        destroyOnClose
        styles={{ body: { padding: 0, overflow: 'hidden' } }}
      >
        <div
          style={{
            height: "85vh",
            overflow: "auto",
            position: "relative",
            padding: "16px",
          }}
        >
          {diffLoading ? (
            <div style={{ padding: 20, textAlign: "center" }}>加载中...</div>
          ) : (
            <div
              dangerouslySetInnerHTML={{
                __html: Diff2Html.html(diffContent, {
                  drawFileList: true,
                  matching: "lines",
                  outputFormat: "side-by-side",
                }),
              }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
}

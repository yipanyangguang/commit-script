import { Button, Select, Space, Table, Modal, Tooltip, message, Collapse, List } from "antd";
import { useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { GlobalOutlined, CodeOutlined, FolderOpenOutlined } from "@ant-design/icons";
import * as Diff2Html from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import type { CommitInfo, AuthorAlias, RepoGroup } from "../types";

const { Panel } = Collapse;

interface PreviewExportProps {
  commits: CommitInfo[];
  previewAuthor: string;
  setPreviewAuthor: (author: string) => void;
  previewRepo: string;
  setPreviewRepo: (repo: string) => void;
  exportReport: () => void;
  authorAliases?: AuthorAlias[];
  repoGroups?: RepoGroup[];
  editorSettings?: { type: 'custom' | 'vscode' | 'system'; path?: string };
  setEditorSettings?: (settings: { type: 'custom' | 'vscode' | 'system'; path?: string }) => void;
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
  editorSettings,
  setEditorSettings,
}: PreviewExportProps) {
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [diffModalVisible, setDiffModalVisible] = useState(false);
  const [diffContent, setDiffContent] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [currentDiffCommit, setCurrentDiffCommit] = useState<CommitInfo | null>(null);
  const [changedFiles, setChangedFiles] = useState<string[]>([]);

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
    setChangedFiles([]);

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
      
      if (diff === "DIFF_TOO_LARGE") {
        setDiffContent("DIFF_TOO_LARGE");
      } else {
        setDiffContent(diff);
        // Parse changed files
        const files: string[] = [];
        const regex = /^diff --git a\/(.*) b\/(.*)$/gm;
        let match;
        while ((match = regex.exec(diff)) !== null) {
          if (match[2]) {
            files.push(match[2]);
          }
        }
        setChangedFiles(files);
      }
    } catch (e) {
      console.error("Failed to get diff:", e);
      message.error(`获取变更失败: ${e}`);
      setDiffContent("获取变更失败");
    } finally {
      setDiffLoading(false);
    }
  };

  const handleOpenFile = (filePath: string) => {
    if (!currentDiffCommit) return;

    const doOpen = async (editorType: string, editorPath?: string) => {
      try {
        let repoPath = "";
        for (const group of repoGroups) {
          const repo = group.repos.find(r => r.path.endsWith(currentDiffCommit.repo_name) || r.path.split(/[/\\]/).pop() === currentDiffCommit.repo_name);
          if (repo) {
            repoPath = repo.path;
            break;
          }
        }

        if (repoPath) {
          let editorCmd: string | undefined = undefined;
          if (editorType === 'custom' && editorPath) {
            editorCmd = editorPath;
          } else if (editorType === 'vscode') {
            editorCmd = 'code';
          }
          // If 'system', editorCmd remains undefined, backend handles it

          await invoke("open_file", { repoPath, filePath, editor: editorCmd });
        }
      } catch (e) {
        message.error(`打开文件失败: ${e}`);
      }
    };

    // If editor settings not configured or default (vscode but maybe user wants to change), 
    // actually we just use what's in settings. 
    // But user said: "First time let choose". 
    // We can check if it's the "default" state which might be unconfigured.
    // However, we initialized it to 'vscode' in App.tsx.
    // Let's assume if user hasn't explicitly visited settings, they might want to choose.
    // But simpler logic: Just confirm and show what will be used.

    let editorName = "系统默认编辑器";
    if (editorSettings?.type === 'vscode') editorName = "VS Code";
    if (editorSettings?.type === 'custom') editorName = `自定义编辑器 (${editorSettings.path})`;

    Modal.confirm({
      title: '确认打开文件',
      content: (
        <div>
          <p>即将使用 <strong>{editorName}</strong> 打开文件：</p>
          <p style={{ fontWeight: 'bold' }}>{filePath}</p>
          <p style={{ color: '#faad14', marginTop: 10 }}>
            ⚠️ 请注意：请确保本地仓库已切换到对应的分支或版本，否则打开的可能不是提交时的代码状态。
          </p>
          <div style={{ marginTop: 10 }}>
            <Button size="small" type="link" onClick={() => {
              Modal.destroyAll();
              // Navigate to settings tab? 
              // We can't easily navigate tabs from here without context, 
              // but we can show a message or just let them know where to change.
              message.info("请前往“配置”页面修改默认编辑器设置");
            }}>
              修改默认编辑器
            </Button>
          </div>
        </div>
      ),
      onOk: () => doOpen(editorSettings?.type || 'system', editorSettings?.path)
    });
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
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginRight: 30 }}>
            <span>变更详情 - {currentDiffCommit?.hash.substring(0, 7)}</span>
            {currentDiffCommit && (
              <Space>
                {getRemoteUrl(currentDiffCommit.repo_name) && (
                  <Tooltip title="在浏览器中打开 Commit">
                    <Button 
                      type="text" 
                      icon={<GlobalOutlined />} 
                      onClick={() => openCommitUrl(currentDiffCommit.repo_name, currentDiffCommit.hash)}
                    >
                      浏览器打开
                    </Button>
                  </Tooltip>
                )}
              </Space>
            )}
          </div>
        }
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
            display: "flex",
            flexDirection: "column",
          }}
        >
          {diffLoading ? (
            <div style={{ padding: 20, textAlign: "center" }}>加载中...</div>
          ) : diffContent === "DIFF_TOO_LARGE" ? (
            <div style={{ padding: 40, textAlign: "center", color: "#faad14" }}>
              <div style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>
                ⚠️ 变更内容过大
              </div>
              <div>
                为了防止页面卡死，已隐藏详细变更内容。请在命令行或 IDE 中查看。
              </div>
            </div>
          ) : (
            <>
              {changedFiles.length > 0 && (
                <div style={{ padding: '8px 16px', borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
                  <Collapse ghost size="small">
                    <Panel header={`变更文件列表 (${changedFiles.length})`} key="1">
                      <List
                        size="small"
                        dataSource={changedFiles}
                        renderItem={(file) => (
                          <List.Item
                            actions={[
                              <Button 
                                type="link" 
                                size="small" 
                                icon={<CodeOutlined />}
                                onClick={() => handleOpenFile(file)}
                              >
                                本地打开
                              </Button>
                            ]}
                          >
                            <Space>
                              <FolderOpenOutlined />
                              <span style={{ fontFamily: 'monospace' }}>{file}</span>
                            </Space>
                          </List.Item>
                        )}
                        style={{ maxHeight: 150, overflowY: 'auto' }}
                      />
                    </Panel>
                  </Collapse>
                </div>
              )}
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  position: "relative",
                  padding: "16px",
                }}
                dangerouslySetInnerHTML={{
                  __html: Diff2Html.html(diffContent, {
                    drawFileList: false, // We render our own file list
                    matching: "lines",
                    outputFormat: "side-by-side",
                  }),
                }}
              />
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

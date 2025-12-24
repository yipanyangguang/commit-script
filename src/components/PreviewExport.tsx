import { Button, Select, Space, Table, Modal } from "antd";
import { useState } from "react";
import type { CommitInfo, AuthorAlias } from "../types";

interface PreviewExportProps {
  commits: CommitInfo[];
  previewAuthor: string;
  setPreviewAuthor: (author: string) => void;
  previewRepo: string;
  setPreviewRepo: (repo: string) => void;
  exportReport: () => void;
  authorAliases?: AuthorAlias[];
}

export function PreviewExport({
  commits,
  previewAuthor,
  setPreviewAuthor,
  previewRepo,
  setPreviewRepo,
  exportReport,
  authorAliases = [],
}: PreviewExportProps) {
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);

  const getAuthorDisplay = (authorName: string) => {
    const alias = authorAliases.find(
      (a) => a.original.toLowerCase() === authorName.toLowerCase()
    );
    return alias ? alias.alias : authorName;
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
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: "序号",
            key: "index",
            render: (_: unknown, __: CommitInfo, index: number) => index + 1,
            width: 60,
          },
          { title: "日期", dataIndex: "date", width: 110 },
          { title: "项目", dataIndex: "repo_name" },
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
    </div>
  );
}

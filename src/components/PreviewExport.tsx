import { Button, Select, Space, Table } from "antd";
import type { CommitInfo } from "../types";

interface PreviewExportProps {
  commits: CommitInfo[];
  previewAuthor: string;
  setPreviewAuthor: (author: string) => void;
  previewRepo: string;
  setPreviewRepo: (repo: string) => void;
  exportReport: () => void;
}

export function PreviewExport({
  commits,
  previewAuthor,
  setPreviewAuthor,
  previewRepo,
  setPreviewRepo,
  exportReport,
}: PreviewExportProps) {
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
                label: a,
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
          { title: "日期", dataIndex: "date", width: 110 },
          { title: "项目", dataIndex: "repo_name" },
          { title: "分支", dataIndex: "branch" },
          { title: "作者", dataIndex: "author" },
          {
            title: "消息",
            dataIndex: "message",
            render: (text: string) => (
              <span title={text}>{text.split("\n")[0]}</span>
            ),
          },
        ]}
      />
    </div>
  );
}

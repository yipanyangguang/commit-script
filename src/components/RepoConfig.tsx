import { Button, List, Space } from "antd";

interface RepoConfigProps {
  repoPaths: string[];
  addRepo: () => void;
  removeRepo: (path: string) => void;
}

export function RepoConfig({ repoPaths, addRepo, removeRepo }: RepoConfigProps) {
  return (
    <div className="tab-content">
      <Space direction="vertical" style={{ width: "100%" }}>
        <Button type="primary" onClick={addRepo}>
          添加仓库
        </Button>
        <List
          bordered
          dataSource={repoPaths}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button danger size="small" onClick={() => removeRepo(item)}>
                  移除
                </Button>,
              ]}
            >
              {item}
            </List.Item>
          )}
        />
      </Space>
    </div>
  );
}

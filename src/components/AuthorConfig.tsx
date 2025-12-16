import { Button, Card, Input, Radio, Space } from "antd";

interface AuthorConfigProps {
  authorMode: "all" | "specific";
  setAuthorMode: (mode: "all" | "specific") => void;
  specificAuthor: string;
  setSpecificAuthor: (author: string) => void;
  startAnalysis: () => void;
  loading: boolean;
}

export function AuthorConfig({
  authorMode,
  setAuthorMode,
  specificAuthor,
  setSpecificAuthor,
  startAnalysis,
  loading,
}: AuthorConfigProps) {
  return (
    <div className="tab-content">
      <Card title="选择统计对象">
        <Space direction="vertical" style={{ width: "100%" }}>
          <Radio.Group
            value={authorMode}
            onChange={(e) => setAuthorMode(e.target.value as "all" | "specific")}
          >
            <Radio value="all">所有用户</Radio>
            <Radio value="specific">指定用户</Radio>
          </Radio.Group>
          {authorMode === "specific" && (
            <Input
              placeholder="请输入作者姓名 (支持模糊匹配)"
              value={specificAuthor}
              onChange={(e) => setSpecificAuthor(e.target.value)}
            />
          )}
          <Button
            type="primary"
            size="large"
            onClick={startAnalysis}
            loading={loading}
            block
            style={{ marginTop: 20 }}
          >
            下一步：开始分析
          </Button>
        </Space>
      </Card>
    </div>
  );
}

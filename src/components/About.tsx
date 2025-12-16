import { Card } from "antd";

export function About() {
  return (
    <div className="tab-content">
      <Card title="关于应用">
        <p>
          <strong>应用名称：</strong> Git Commit 导出工具
        </p>
        <p>
          <strong>版本：</strong> 0.1.0
        </p>
        <p>
          <strong>功能描述：</strong>{" "}
          本工具用于批量导出多个 Git
          仓库的提交记录，支持按时间范围、作者进行筛选，并生成格式化的周报/日报文本文件。
        </p>
      </Card>
      <Card title="作者信息" style={{ marginTop: 20 }}>
        <p>
          <strong>开发者：</strong> H5 - zhang wenxiang
        </p>
        <p>
          <strong>技术栈：</strong> Tauri v2 + React + TypeScript + Ant Design +
          Rust
        </p>
      </Card>
    </div>
  );
}

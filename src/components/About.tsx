import { useState, useEffect } from "react";
import { Card } from "antd";
import { getVersion } from "@tauri-apps/api/app";
import ReactMarkdown from "react-markdown";
import changelog from "../../CHANGELOG.md?raw";

export function About() {
  const [version, setVersion] = useState("Loading...");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("Unknown"));
  }, []);

  return (
    <div className="tab-content">
      <Card title="关于应用">
        <p>
          <strong>应用名称：</strong> Git Commit 导出工具
        </p>
        <p>
          <strong>版本：</strong> {version}
        </p>
        <p>
          <strong>功能描述：</strong>{" "}
          本工具用于批量导出多个 Git
          仓库的提交记录，支持按时间范围、作者进行筛选，并生成格式化的周报/日报文本文件。
        </p>
      </Card>
      <Card title="作者信息" style={{ marginTop: 20 }}>
        <p>
          <strong>开发者：</strong> yipanyangguang@foxmail.com
        </p>
        <p>
          <strong>技术栈：</strong> Tauri v2 + React + TypeScript + Ant Design +
          Rust + Dayjs + React-markdown
        </p>
      </Card>
      <Card title="更新日志" style={{ marginTop: 20 }}>
        <div
          style={{
            maxHeight: "300px",
            overflowY: "auto",
            background: "#f5f5f5",
            padding: "20px",
            borderRadius: "4px",
          }}
        >
          <ReactMarkdown>{changelog}</ReactMarkdown>
        </div>
      </Card>
    </div>
  );
}

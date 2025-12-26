import { useRef, useState } from "react";
import { Card, Col, Row, Statistic, Empty, Tooltip as AntTooltip, Button, Typography, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import html2canvas from "html2canvas";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import type { CommitInfo, AuthorAlias } from "../types";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

interface DashboardProps {
  commits: CommitInfo[];
  authorAliases?: AuthorAlias[];
  dateRange: [Dayjs, Dayjs];
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

// Heatmap Component
function ContributionHeatmap({ commits, dateRange }: { commits: CommitInfo[], dateRange: [Dayjs, Dayjs] }) {
  const [start, end] = dateRange;
  const startDate = start.startOf("day");
  const endDate = end.endOf("day");
  const totalDays = endDate.diff(startDate, "day") + 1;
  
  const dateMap = commits.reduce((acc, commit) => {
    acc[commit.date] = (acc[commit.date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const days = [];
  let currentDate = startDate.clone();

  for (let i = 0; i < totalDays; i++) {
    const dateStr = currentDate.format("YYYY-MM-DD");
    const count = dateMap[dateStr] || 0;
    
    // Determine color intensity
    let color = "#ebedf0"; // 0
    if (count > 0) color = "#9be9a8"; // 1-2
    if (count > 2) color = "#40c463"; // 3-5
    if (count > 5) color = "#30a14e"; // 6-10
    if (count > 10) color = "#216e39"; // >10

    days.push({ date: dateStr, count, color, dayOfMonth: currentDate.date() });
    currentDate = currentDate.add(1, "day");
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: 10 }}>
      {days.map((day) => (
        <AntTooltip key={day.date} title={`${day.date}: ${day.count} commits`}>
          <div
            style={{
              width: 24,
              height: 24,
              backgroundColor: day.color,
              borderRadius: 3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: day.count > 0 ? "#fff" : "#999",
              cursor: "default",
            }}
          >
            {day.dayOfMonth}
          </div>
        </AntTooltip>
      ))}
    </div>
  );
}

export function Dashboard({ commits, authorAliases = [], dateRange }: DashboardProps) {
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const handleExportImage = async () => {
    if (!dashboardRef.current) return;
    setExporting(true);
    const msgKey = "export_image";
    message.loading({ content: "正在生成图片...", key: msgKey, duration: 0 });

    try {
      const canvas = await html2canvas(dashboardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f5f5f5',
      });
      
      // Convert canvas to blob/buffer
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to create blob");
      
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Open save dialog
      const filePath = await save({
        defaultPath: `dashboard-${dayjs().format("YYYYMMDD-HHmmss")}.png`,
        filters: [{
          name: 'Image',
          extensions: ['png']
        }]
      });

      if (filePath) {
        await writeFile(filePath, uint8Array);
        message.success({ content: "图片导出成功", key: msgKey, duration: 2 });
      } else {
        message.info({ content: "已取消导出", key: msgKey, duration: 2 });
      }
    } catch (e) {
      console.error("Export failed:", e);
      message.error({ content: "图片导出失败，请尝试保存到“下载”或“文档”等常用目录", key: msgKey, duration: 4 });
    } finally {
      setExporting(false);
    }
  };

  if (commits.length === 0) {
    return (
      <div className="tab-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Empty description="暂无数据，请先在“基本配置”中开始分析" />
      </div>
    );
  }

  // Helper to get display name
  const getAuthorName = (originalName: string) => {
    const cleanOriginal = originalName.trim();
    const alias = authorAliases.find(a => 
      a.original.trim() === cleanOriginal || 
      a.original.trim().toLowerCase() === cleanOriginal.toLowerCase()
    );
    return alias ? alias.alias : originalName;
  };

  // 1. 提交类型统计
  const typeData = commits.reduce((acc, commit) => {
    const type = commit.message.split(":")[0].split("(")[0].trim().toLowerCase();
    const knownTypes = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "build", "ci", "revert"];
    const cleanType = knownTypes.includes(type) ? type : "other";
    acc[cleanType] = (acc[cleanType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(typeData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 2. 每日提交趋势 & 代码行数
  const dailyDataMap = commits.reduce((acc, commit) => {
    const date = commit.date;
    if (!acc[date]) {
      acc[date] = { date, count: 0, insertions: 0, deletions: 0 };
    }
    acc[date].count += 1;
    acc[date].insertions += commit.insertions || 0;
    acc[date].deletions += commit.deletions || 0;
    return acc;
  }, {} as Record<string, { date: string; count: number; insertions: number; deletions: number }>);

  const dailyData = Object.values(dailyDataMap)
    .sort((a, b) => dayjs(a.date).unix() - dayjs(b.date).unix());

  // 3. 活跃作者
  const authorData = commits.reduce((acc, commit) => {
    const name = getAuthorName(commit.author);
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topAuthors = Object.entries(authorData)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 4. 工作时段分析
  const hourlyDataMap = commits.reduce((acc, commit) => {
    // timestamp is in seconds
    const hour = dayjs.unix(commit.timestamp).hour();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const hourlyData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}`,
    count: hourlyDataMap[i] || 0,
  }));

  // 5. 总代码行数
  const totalInsertions = commits.reduce((sum, c) => sum + (c.insertions || 0), 0);
  const totalDeletions = commits.reduce((sum, c) => sum + (c.deletions || 0), 0);

  // 6. 成员代码变动统计
  const authorStatsMap = commits.reduce((acc, commit) => {
    const name = getAuthorName(commit.author);
    if (!acc[name]) {
      acc[name] = { name, insertions: 0, deletions: 0, net: 0 };
    }
    acc[name].insertions += commit.insertions || 0;
    acc[name].deletions += commit.deletions || 0;
    acc[name].net += (commit.insertions || 0) - (commit.deletions || 0);
    return acc;
  }, {} as Record<string, { name: string; insertions: number; deletions: number; net: number }>);

  const authorStats = Object.values(authorStatsMap)
    .sort((a, b) => b.insertions - a.insertions)
    .slice(0, 10);

  // Get unique repo names
  const repoNames = Array.from(new Set(commits.map(c => c.repo_name))).join(", ");

  return (
    <div className="tab-content" ref={dashboardRef} style={{ overflowY: 'auto', overflowX: 'hidden', paddingBottom: 20, padding: 24, background: '#f5f5f5' }}>
       {/* Header */}
       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>数据概览</Typography.Title>
            <Typography.Text type="secondary">
              {dateRange[0].format("YYYY-MM-DD")} 至 {dateRange[1].format("YYYY-MM-DD")}
            </Typography.Text>
          </div>
          <Button icon={<DownloadOutlined />} onClick={handleExportImage} loading={exporting} data-html2canvas-ignore="true">导出图片</Button>
       </div>

      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic title="总提交数" value={commits.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="活跃天数" value={dailyData.length} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="新增代码行" value={totalInsertions} valueStyle={{ color: '#3f8600' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="删除代码行" value={totalDeletions} valueStyle={{ color: '#cf1322' }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="贡献热力图">
            <ContributionHeatmap commits={commits} dateRange={dateRange} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="代码变动趋势">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="insertions" name="新增" fill="#82ca9d" stackId="a" />
                  <Bar dataKey="deletions" name="删除" fill="#ff8042" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="工作时段分布">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" unit="点" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" name="提交数" stroke="#8884d8" fill="#8884d8" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="提交类型分布">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="40%"
                    cy="50%"
                    labelLine={false}
                    label={({ percent }: { percent?: number }) => `${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend layout="vertical" verticalAlign="middle" align="right" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col span={12}>
            <Card title="Top 5 活跃作者">
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topAuthors} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis dataKey="author" type="category" width={100} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#82ca9d" name="提交数" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
            </Card>
         </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={24}>
          <Card title="成员代码变动统计">
            <div style={{ height: 400 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={authorStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="insertions" name="增加行数" fill="#82ca9d" />
                  <Bar dataKey="deletions" name="减少行数" fill="#ff8042" />
                  <Bar dataKey="net" name="净增加行数" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

       {/* Footer */}
       <div style={{ marginTop: 24, textAlign: 'center', color: '#888' }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
             统计项目: {repoNames} | 时间范围: {dateRange[0].format("YYYY-MM-DD")} ~ {dateRange[1].format("YYYY-MM-DD")}
          </Typography.Text>
       </div>
    </div>
  );
}

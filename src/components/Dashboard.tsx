import { Card, Col, Row, Statistic, Empty } from "antd";
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
} from "recharts";
import type { CommitInfo, AuthorAlias } from "../types";
import dayjs from "dayjs";

interface DashboardProps {
  commits: CommitInfo[];
  authorAliases?: AuthorAlias[];
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

export function Dashboard({ commits, authorAliases = [] }: DashboardProps) {
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
    // Try exact match first (trimmed), then case-insensitive match
    const alias = authorAliases.find(a => 
      a.original.trim() === cleanOriginal || 
      a.original.trim().toLowerCase() === cleanOriginal.toLowerCase()
    );
    return alias ? alias.alias : originalName;
  };

  // 1. 提交类型统计 (feat, fix, etc.)
  const typeData = commits.reduce((acc, commit) => {
    const type = commit.message.split(":")[0].split("(")[0].trim().toLowerCase();
    // Simple heuristic for conventional commits
    const knownTypes = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "build", "ci", "revert"];
    const cleanType = knownTypes.includes(type) ? type : "other";
    
    acc[cleanType] = (acc[cleanType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(typeData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // 2. 每日提交趋势
  const dateData = commits.reduce((acc, commit) => {
    const date = commit.date; // YYYY-MM-DD
    acc[date] = (acc[date] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Fill in missing dates if needed, but for now just show active days
  // Or better, sort by date
  const barData = Object.entries(dateData)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => dayjs(a.date).unix() - dayjs(b.date).unix());

  // 3. 活跃作者 (Top 5)
  const authorData = commits.reduce((acc, commit) => {
    const name = getAuthorName(commit.author);
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const topAuthors = Object.entries(authorData)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="tab-content" style={{ overflowY: 'auto', overflowX: 'hidden', paddingBottom: 20 }}>
      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card>
            <Statistic title="总提交数" value={commits.length} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="活跃天数" value={barData.length} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="参与作者" value={Object.keys(authorData).length} />
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
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="每日提交趋势">
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8884d8" name="提交数" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>
      
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
         <Col span={24}>
            <Card title="Top 5 活跃作者">
                <div style={{ height: 250 }}>
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
    </div>
  );
}

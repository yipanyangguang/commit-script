import { Button, Card, DatePicker, Input, Radio, Space, Divider } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

interface BasicConfigProps {
  dateRange: [Dayjs, Dayjs];
  setDateRange: (dates: [Dayjs, Dayjs]) => void;
  authorMode: "all" | "specific";
  setAuthorMode: (mode: "all" | "specific") => void;
  specificAuthor: string;
  setSpecificAuthor: (author: string) => void;
  startAnalysis: () => void;
  loading: boolean;
}

export function BasicConfig({
  dateRange,
  setDateRange,
  authorMode,
  setAuthorMode,
  specificAuthor,
  setSpecificAuthor,
  startAnalysis,
  loading,
}: BasicConfigProps) {
  const setDateRangeShortcut = (
    type: "thisWeek" | "lastWeek" | "yesterday" | "today"
  ) => {
    const today = dayjs();
    let start: Dayjs;
    let end: Dayjs;

    switch (type) {
      case "thisWeek":
        start = today.startOf("week").add(1, "day");
        end = today.endOf("week").add(1, "day");
        break;
      case "lastWeek":
        start = today.subtract(1, "week").startOf("week").add(1, "day");
        end = today.subtract(1, "week").endOf("week").add(1, "day");
        break;
      case "yesterday":
        start = today.subtract(1, "day");
        end = today.subtract(1, "day");
        break;
      case "today":
        start = today;
        end = today;
        break;
    }
    setDateRange([start, end]);
  };

  return (
    <div className="tab-content">
      <Card title="基本配置">
        <Space orientation="vertical" style={{ width: "100%" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>时间范围</div>
            <Space orientation="vertical" style={{ width: "100%" }}>
              <Space wrap>
                <Button size="small" onClick={() => setDateRangeShortcut("today")}>
                  今天
                </Button>
                <Button size="small" onClick={() => setDateRangeShortcut("yesterday")}>
                  昨天
                </Button>
                <Button size="small" onClick={() => setDateRangeShortcut("thisWeek")}>
                  本周
                </Button>
                <Button size="small" onClick={() => setDateRangeShortcut("lastWeek")}>
                  上周
                </Button>
              </Space>
              <RangePicker
                value={dateRange}
                onChange={(dates) => {
                  if (dates) {
                    setDateRange(dates as [Dayjs, Dayjs]);
                  }
                }}
                style={{ width: "100%" }}
              />
            </Space>
          </div>

          <Divider />

          <div style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>统计对象</div>
            <Space orientation="vertical" style={{ width: "100%" }}>
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
            </Space>
          </div>

          <Button
            type="primary"
            size="large"
            onClick={startAnalysis}
            loading={loading}
            block
            style={{ marginTop: 20 }}
          >
            开始分析
          </Button>
        </Space>
      </Card>
    </div>
  );
}

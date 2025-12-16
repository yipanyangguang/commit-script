import { Button, Card, DatePicker, Space } from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

interface DateConfigProps {
  dateRange: [Dayjs, Dayjs];
  setDateRange: (dates: [Dayjs, Dayjs]) => void;
}

export function DateConfig({ dateRange, setDateRange }: DateConfigProps) {
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
      <Card title="选择统计时间范围">
        <Space direction="vertical" style={{ width: "100%" }}>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates) {
                setDateRange(dates as [Dayjs, Dayjs]);
              }
            }}
            style={{ width: "100%" }}
          />
          <Space>
            <Button size="small" onClick={() => setDateRangeShortcut("thisWeek")}>
              这周
            </Button>
            <Button size="small" onClick={() => setDateRangeShortcut("lastWeek")}>
              上周
            </Button>
            <Button
              size="small"
              onClick={() => setDateRangeShortcut("yesterday")}
            >
              昨天
            </Button>
            <Button size="small" onClick={() => setDateRangeShortcut("today")}>
              今天
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}

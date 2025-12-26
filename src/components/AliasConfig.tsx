import { Button, Form, Input, Table, Space, Typography, Popconfirm } from "antd";
import type { AuthorAlias } from "../types";

const { Title } = Typography;

interface AliasConfigProps {
  aliases: AuthorAlias[];
  setAliases: (aliases: AuthorAlias[]) => void;
}

export function AliasConfig({ aliases, setAliases }: AliasConfigProps) {
  const [form] = Form.useForm();

  const onFinish = (values: { original: string; alias: string }) => {
    // Check for duplicates
    if (aliases.some(a => a.original === values.original.trim())) {
        // You might want to handle update logic here, but for now let's just append
        // or maybe alert. But simple append is fine, user can delete.
    }

    const newAlias: AuthorAlias = {
      id: Math.random().toString(36).substr(2, 9),
      original: values.original.trim(),
      alias: values.alias.trim(),
    };
    setAliases([...aliases, newAlias]);
    form.resetFields();
  };

  const handleDelete = (id: string) => {
    setAliases(aliases.filter((item) => item.id !== id));
  };

  const columns = [
    {
      title: "原名 (Git Author)",
      dataIndex: "original",
      key: "original",
    },
    {
      title: "别名 (显示名称)",
      dataIndex: "alias",
      key: "alias",
    },
    {
      title: "操作",
      key: "action",
      render: (_: unknown, record: AuthorAlias) => (
        <Popconfirm title="确定删除吗?" onConfirm={() => handleDelete(record.id)}>
          <Button type="link" danger>
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div className="tab-content">
      <Space orientation="vertical" style={{ width: "100%" }} size="large">
        <div>
          <Title level={5}>添加别名</Title>
          <Form form={form} layout="inline" onFinish={onFinish}>
            <Form.Item
              name="original"
              rules={[{ required: true, message: "请输入原名" }]}
            >
              <Input placeholder="原名" />
            </Form.Item>
            <Form.Item
              name="alias"
              rules={[{ required: true, message: "请输入别名" }]}
            >
              <Input placeholder="别名" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit">
                添加
              </Button>
            </Form.Item>
          </Form>
        </div>

        <Table
          dataSource={aliases}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          bordered
          locale={{ emptyText: "暂无别名配置" }}
        />
      </Space>
    </div>
  );
}

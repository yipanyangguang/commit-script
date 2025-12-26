import { Button, Form, Input, Table, Space, Typography, Popconfirm, Card, Radio, message } from "antd";
import { open } from "@tauri-apps/plugin-dialog";
import type { AuthorAlias } from "../types";

const { Title, Text } = Typography;

interface SettingsProps {
  aliases: AuthorAlias[];
  setAliases: (aliases: AuthorAlias[]) => void;
  editorSettings: { type: 'custom' | 'vscode' | 'system'; path?: string };
  setEditorSettings: (settings: { type: 'custom' | 'vscode' | 'system'; path?: string }) => void;
}

export function Settings({ aliases, setAliases, editorSettings, setEditorSettings }: SettingsProps) {
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

  const handleSelectEditor = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
      });

      if (selected && typeof selected === 'string') {
        setEditorSettings({ type: 'custom', path: selected });
        message.success(`已选择编辑器: ${selected}`);
      }
    } catch (e) {
      console.error(e);
      message.error('选择文件失败');
    }
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
        <Card title="编辑器配置" size="small">
          <Space orientation="vertical" style={{ width: "100%" }}>
            <Text type="secondary">设置“本地打开”文件时使用的编辑器。</Text>
            <Radio.Group 
              value={editorSettings.type} 
              onChange={e => setEditorSettings({ ...editorSettings, type: e.target.value })}
            >
              <Space direction="vertical">
                <Radio value="vscode">使用 VS Code (尝试自动寻找)</Radio>
                <Radio value="system">使用系统默认程序</Radio>
                <Radio value="custom">
                  自定义编辑器路径
                  {editorSettings.type === 'custom' && (
                    <div style={{ marginTop: 8, marginLeft: 24 }}>
                      <Space>
                        <Input 
                          value={editorSettings.path} 
                          placeholder="请输入或选择编辑器可执行文件路径" 
                          style={{ width: 300 }}
                          onChange={e => setEditorSettings({ ...editorSettings, path: e.target.value })}
                        />
                        <Button onClick={handleSelectEditor}>选择文件...</Button>
                      </Space>
                    </div>
                  )}
                </Radio>
              </Space>
            </Radio.Group>
          </Space>
        </Card>

        <Card title="别名配置" size="small">
          <Space orientation="vertical" style={{ width: "100%" }} size="middle">
            <div>
              <Title level={5} style={{ marginTop: 0 }}>添加别名</Title>
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
        </Card>
      </Space>
    </div>
  );
}

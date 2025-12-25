import { Button, List, Space, Checkbox, Collapse, Input, Typography } from "antd";
import type { RepoGroup } from "../types";
import { useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const { Panel } = Collapse;
const { Text } = Typography;

interface RepoConfigProps {
  repoGroups: RepoGroup[];
  addRepo: (groupId: string) => void;
  removeRepo: (groupId: string, path: string) => void;
  addGroup: () => void;
  removeGroup: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  toggleGroup: (groupId: string, checked: boolean) => void;
  updateGroup: (groupId: string) => void;
  checkGroupStatus: (groupId: string) => void;
  checkingGroupId: string | null;
}

export function RepoConfig({
  repoGroups,
  addRepo,
  removeRepo,
  addGroup,
  removeGroup,
  renameGroup,
  toggleGroup,
  updateGroup,
  checkGroupStatus,
  checkingGroupId,
}: RepoConfigProps) {
  // State for editing group name
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [activeKeys, setActiveKeys] = useState<string[]>(() => {
    const saved = localStorage.getItem("repoConfigActiveKeys");
    return saved ? JSON.parse(saved) : repoGroups.map((g) => g.id);
  });

  const handleCollapseChange = (keys: string | string[]) => {
    const newKeys = Array.isArray(keys) ? keys : [keys];
    setActiveKeys(newKeys);
    localStorage.setItem("repoConfigActiveKeys", JSON.stringify(newKeys));
  };

  const startEditing = (group: RepoGroup) => {
    setEditingGroupId(group.id);
    setEditingName(group.name);
  };

  const saveEditing = (groupId: string) => {
    if (editingName.trim()) {
      renameGroup(groupId, editingName);
    }
    setEditingGroupId(null);
  };

  return (
    <div className="tab-content">
      <Space direction="vertical" style={{ width: "100%" }}>
        <Space>
          <Button type="primary" onClick={addGroup}>
            新建分组
          </Button>
        </Space>
        
        <Collapse activeKey={activeKeys} onChange={handleCollapseChange}>
          {repoGroups.map((group) => (
            <Panel
              key={group.id}
              header={
                <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Checkbox
                    checked={group.selected}
                    onChange={(e) => toggleGroup(group.id, e.target.checked)}
                  />
                  {editingGroupId === group.id ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => saveEditing(group.id)}
                      onPressEnter={() => saveEditing(group.id)}
                      autoFocus
                      size="small"
                      style={{ width: 200 }}
                    />
                  ) : (
                    <span onDoubleClick={() => startEditing(group)} style={{ cursor: 'text' }}>
                      {group.name} <Text type="secondary" style={{ fontSize: 12 }}>(双击重命名)</Text>
                    </span>
                  )}
                  <Button
                    size="small"
                    loading={checkingGroupId === group.id}
                    disabled={!!checkingGroupId}
                    onClick={(e) => {
                      e.stopPropagation();
                      checkGroupStatus(group.id);
                    }}
                  >
                    获取状态
                  </Button>
                  {group.lastChecked && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {dayjs(group.lastChecked).fromNow()}
                    </Text>
                  )}
                  {group.repos.some((r) => r.hasUpdates) && (
                    <Button
                      type="primary"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateGroup(group.id);
                      }}
                    >
                      更新
                    </Button>
                  )}
                </div>
              }
              extra={
                <Button 
                  danger 
                  size="small" 
                  type="text"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeGroup(group.id);
                  }}
                >
                  删除分组
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: "100%" }}>
                <Button size="small" onClick={() => addRepo(group.id)}>
                  添加仓库到此分组
                </Button>
                <List
                  bordered
                  size="small"
                  dataSource={group.repos}
                  rowKey="path"
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button
                          danger
                          size="small"
                          type="link"
                          onClick={() => removeRepo(group.id, item.path)}
                        >
                          移除
                        </Button>,
                      ]}
                    >
                      <Space direction="vertical" style={{ width: "100%" }} size={0}>
                        <Text>{item.path}</Text>
                        {item.hasUpdates !== undefined && (
                          <Text
                            type={item.hasUpdates ? "warning" : "secondary"}
                            style={{ fontSize: 12 }}
                          >
                            {item.hasUpdates
                              ? "⚠️ 远端有更新"
                              : `✅ 已是最新${
                                  item.lastChecked
                                    ? ` (${dayjs(item.lastChecked).format(
                                        "YYYY-MM-DD HH:mm:ss"
                                      )})`
                                    : ""
                                }`}
                          </Text>
                        )}
                      </Space>
                    </List.Item>
                  )}
                />
              </Space>
            </Panel>
          ))}
        </Collapse>
      </Space>
    </div>
  );
}

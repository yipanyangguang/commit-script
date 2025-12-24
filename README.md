下载地址
https://www.yuque.com/yipanyangguang/tools/yx9yqgxfovdt6ykp

For Desktop development, run:
yarn tauri dev

## 开发指南

### 1. 修改版本号
请确保以下三个文件的版本号保持一致：
- `package.json`: `"version": "x.x.x"`
- `src-tauri/tauri.conf.json`: `"version": "x.x.x"`
- `src-tauri/Cargo.toml`: `version = "x.x.x"`

### 2. 修改应用图标
应用图标位于 `src-tauri/icons/` 目录下。
- macOS 需要 `icon.icns`
- Windows 需要 `icon.ico`
- Linux 需要 `32x32.png`, `128x128.png` 等

请替换对应文件即可。

### 3. 打包 macOS 桌面端
在终端运行以下命令进行打包：

```bash
yarn tauri build
```

打包完成后，安装包位于 `src-tauri/target/release/bundle/dmg/` 目录下。

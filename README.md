# StarWeave UI

StarWeave UI 是 StarWeave 的本地浏览器设计界面。它保留 OpenPencil 的专业画布、图层、属性面板、代码预览和文件能力，移除了 OpenPencil 自带的 AI 聊天、模型配置、ACP、MCP 设置以及 Rust/Tauri 桌面外壳。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run build
pnpm run dev
```

构建输出位于 `dist/`。StarWeave 发布构建使用已内置到桌面仓库的静态产物，不依赖相邻的 `starweave-ui` 工作目录。

StarWeave 桌面端会在随机端口提供该界面：MCP 和设计控制桥仅允许本机访问，静态界面与 `/collaboration/<room>` WebSocket 仅允许本机或私有网络访问。局域网协作复用 StarWeave 内置服务，不连接 OpenPencil 的公网 MQTT、STUN、TURN 或 relay。

直接访问开发服务器时，编辑器运行在独立模式。由 StarWeave 打开的 URL 会包含短期设计会话参数；页面读取后立即从地址栏移除认证 token。

`pnpm run preview` 只预览静态构建，不提供 MCP bridge 或局域网协作 relay；需要这些能力时请通过 StarWeave 桌面端打开设计器。

## 发布

推送到 `main` 或提交 Pull Request 时，GitHub Actions 会执行依赖锁定安装、类型检查和生产构建。

发布版本时，先将根 `package.json` 的 `version` 更新为目标版本并推送，然后创建同版本 Tag：

```bash
git tag v0.1.0
git push origin main v0.1.0
```

Tag 必须严格等于 `v<package.json version>`。Tag workflow 会创建对应 GitHub Release，并上传：

- `starweave-ui-dist.tar.gz`
- `starweave-ui-dist.tar.gz.sha256`

StarWeave 桌面项目的 seed 构建会从该仓库的最新稳定 Release 下载并校验这两个资产；桌面应用运行时不会访问 GitHub 获取 UI。

## 来源与许可

本项目基于 OpenPencil `cb7ceea61ab1a419374f9af9bde05d033be0881f`（0.14.0 master，获取于 2026-09-03）的 Web 实现派生，保留原项目 MIT 许可。原项目：<https://github.com/open-pencil/open-pencil>。

StarWeave 的定制代码同样按仓库中的 [LICENSE](LICENSE) 授权。

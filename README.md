# Lyric Veil

Lyric Veil 是一个面向桌面播放和投屏场景的全屏歌词展示页。它可以读取 QQ 音乐当前播放信息，自动匹配本地或网络 LRC 歌词，并用更接近卡拉 OK 的方式呈现当前句、下一句和扫光进度。

项目重点不是做一个完整播放器，而是做一个轻量、稳定、视觉效果更好的“歌词舞台”：音乐仍由 QQ 音乐播放，Lyric Veil 负责识别歌曲、同步时间轴、显示歌词和背景。

## 功能亮点

- QQ 音乐联动：读取当前歌曲、歌手、播放进度、播放状态和时长。
- 跟随播放：QQ 音乐暂停、继续、切歌或拖动进度后，页面会自动同步。
- 自动找词：优先匹配本地歌词目录，再回退到在线歌词源。
- 本地 LRC：支持手动导入 `.lrc`，并兼容 UTF-8 / GB18030 编码。
- 双行卡拉 OK：主歌词显示当前句，副歌词预览下一句，适合投屏跟唱。
- 歌词扫光：高亮颜色按播放进度从左到右推进，长句会自动分成两行。
- 多种歌词效果：支持逐字、逐词、淡入、打字机、上浮等显示模式。
- 背景系统：支持动态视觉、视频背景、亮度、暗角和模糊调节。
- 用户体验优化：设置面板可收起，快捷预设可快速切换清晰、舞台、柔和模式。
- Windows 自动启动：可安装监听任务，打开 QQ 音乐时自动启动 Lyric Veil。

## 运行

需要先安装 Node.js。

推荐使用一键安装脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\Install-LyricVeil.ps1
```

安装脚本会完成：

- 检查 Node.js
- 安装 npm 依赖
- 创建桌面快捷方式
- 创建开始菜单快捷方式
- 安装 QQ 音乐启动监听任务
- 启动本地服务并打开页面

卸载：

```powershell
powershell -ExecutionPolicy Bypass -File .\Uninstall-LyricVeil.ps1
```

也可以手动运行：

```powershell
npm install
$env:PORT="8000"
npm start
```

打开：

```text
http://localhost:8000
```

如果不指定 `PORT`，默认端口是 `5173`。

## 基本使用

1. 打开 QQ 音乐并播放歌曲。
2. 打开 Lyric Veil 页面。
3. 点击 `QQ` 读取当前歌曲。
4. 点击 `跟随` 让歌词进度跟随 QQ 音乐。
5. 点击 `LRC` 自动匹配歌词，或手动导入 `.lrc` 文件。
6. 根据背景和投屏环境调整清晰度、亮度、扫光颜色、描边和阴影。

页面启动后也会尝试自动进入跟随流程。如果 QQ 音乐已经在播放，通常无需手动操作。

## 歌词来源

歌词匹配顺序：

1. 本地歌词目录：`E:\播放\歌词`
2. 浏览器本地缓存中已保存的歌词
3. 在线歌词接口
4. 手动导入的 `.lrc` 文件

本地歌词文件建议命名为：

```text
歌曲名 - 歌手.lrc
歌曲名.lrc
```

如果歌词出现乱码，优先确认文件是否为 UTF-8 或 GB18030 编码。项目已做自动解码兜底，但非常规编码仍建议手动转成 UTF-8。

## QQ 音乐联动

Windows 下优先使用系统媒体会话 GSMTC 读取当前播放信息；如果系统接口不可用，会回退到 QQ 音乐窗口标题解析。

可同步的信息包括：

- 当前歌曲名
- 歌手
- 播放进度
- 歌曲总时长
- 播放 / 暂停状态

限制：

- 不破解 QQ 音乐。
- 不读取账号、音频流或 QQ 音乐内部私有数据。
- 歌词来自本地文件、缓存或公开歌词接口。
- 如果 QQ 音乐没有暴露系统媒体信息，识别准确度会依赖窗口标题。

## 打开 QQ 音乐后自动启动

项目提供 Windows 计划任务脚本。安装后，系统登录时会启动一个隐藏监听任务；检测到 QQ 音乐打开后，会自动启动 Lyric Veil 服务并打开页面。

安装：

```powershell
powershell -ExecutionPolicy Bypass -File E:\播放\LyricVeil\scripts\install-qqmusic-autostart.ps1 -Port 8000
```

卸载：

```powershell
powershell -ExecutionPolicy Bypass -File E:\播放\LyricVeil\scripts\uninstall-qqmusic-autostart.ps1
```

监听脚本默认不会弹出终端窗口，只会在需要时打开浏览器页面。

## 快捷键

- `Space`：播放 / 暂停页面内置计时
- `F`：开启 / 关闭 QQ 音乐跟随
- `P`：进入 / 退出展示模式
- `Esc`：显示设置面板

## 项目结构

```text
LyricVeil/
  index.html                    页面结构
  server.js                     本地服务、歌曲识别、歌词搜索
  src/main.js                   前端交互、歌词同步、背景控制
  src/styles.css                视觉样式和歌词动画
  scripts/
    windows-now-playing-gsmtc.cs       Windows GSMTC 读取工具源码
    windows-now-playing-gsmtc.exe      Windows GSMTC 读取工具
    windows-now-playing.ps1            Windows 回退识别脚本
    windows-qqmusic-autostart.ps1      QQ 音乐启动监听
    install-qqmusic-autostart.ps1      安装自动启动任务
    uninstall-qqmusic-autostart.ps1    卸载自动启动任务
```

## 适用场景

- 桌面歌词大屏
- 投屏跟唱
- 直播或录屏背景歌词
- 家庭 K 歌氛围屏
- 使用 QQ 音乐播放、本项目负责视觉展示的轻量工作流

## 开发说明

启动开发时可以直接运行本地服务：

```powershell
$env:PORT="8000"
node server.js
```

提交前建议至少检查前端脚本语法：

```powershell
node --check .\src\main.js
```

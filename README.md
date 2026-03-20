## MoeKoe Music 音乐信息显示插件
## 简介
这是一个为 MoeKoe Music 桌面版（基于 Electron）开发的扩展插件。它能在播放器界面的右下角显示当前歌曲的音频格式（如 MP3、FLAC）和文件大小（自动转换为 B、KB、MB、GB），帮助用户快速了解当前播放的音乐文件信息。

插件通过调用 MoeKoe Music 本地的 HTTP API 获取歌曲的 fileSize 和 extName，无需额外网络请求，速度极快。

## 功能特点
🎵 自动获取：从 localStorage.current_song 读取当前歌曲的 hash，调用本地 API 获取文件信息。

📍 位置靠右：显示在播放器容器（.player-container）的右下角，不干扰主要控制按钮。

📦 轻量无缓存：每次切歌都会请求最新数据，确保信息准确（无需担心缓存过期）。

## 安装方法
1 下载插件zip
2 进入插件设置内安装
3 重启 MoeKoe Music

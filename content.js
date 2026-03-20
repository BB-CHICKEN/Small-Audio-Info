// ======================== 工具函数 ========================
function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return '未知';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ======================== 通过 hash 获取文件信息（无缓存） ========================
async function fetchAudioInfoByHash(hash) {
  if (!hash) return null;

  const url = `http://127.0.0.1:6521/song/url?hash=${hash}&quality=high`;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.fileSize === 'number' && data.extName) {
        return {
          size: data.fileSize,
          format: data.extName
        };
      } else {
        console.warn('接口返回数据缺少 fileSize 或 extName:', data);
      }
    }
  } catch (err) {
    console.warn('获取音乐信息失败:', err);
  }
  return null;
}

// ======================== 获取当前歌曲信息 ========================
function getCurrentSong() {
  try {
    return JSON.parse(localStorage.getItem('current_song') || '{}');
  } catch (e) {
    return {};
  }
}

function getCurrentHash() {
  const song = getCurrentSong();
  return song.hash || null;
}

// ======================== 显示逻辑 ========================
let infoDisplay = null;
let currentHash = null;

async function updateDisplay() {
  if (!infoDisplay) return;

  const newHash = getCurrentHash();

  // 只有 hash 变化时才更新
  if (newHash === currentHash) return;
  currentHash = newHash;

  if (!currentHash) {
    infoDisplay.innerHTML = `<div class="music-format">无音频</div><div class="music-size"></div>`;
    return;
  }

  // 显示加载中
  infoDisplay.innerHTML = `<div class="music-format">加载中...</div><div class="music-size"></div>`;

  const info = await fetchAudioInfoByHash(currentHash);
  if (info && info.size !== null) {
    const format = info.format.toUpperCase();
    const sizeText = formatBytes(info.size);
    infoDisplay.innerHTML = `<div class="music-format">${format}</div><div class="music-size">${sizeText}</div>`;
  } else {
    infoDisplay.innerHTML = `<div class="music-format">未知</div><div class="music-size">未知</div>`;
  }
}

// ======================== 插入显示元素 ========================
function init() {
  const observer = new MutationObserver((_, obs) => {
    const container = document.querySelector('.player-container');
    if (!container) return;
    obs.disconnect();

    infoDisplay = document.createElement('div');
    infoDisplay.className = 'music-info-display';
    infoDisplay.style.cssText = `
      position: absolute;
      right: 15px;
      bottom: 20px;
      padding: 5px 10px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      color: #c5c5c5ff;
      text-align: center;
      z-index: 1000;
      pointer-events: none;
      white-space: nowrap;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }
    container.appendChild(infoDisplay);

    updateDisplay();          // 立即显示当前歌曲信息
    setInterval(updateDisplay, 1000); // 1秒轮询，作为唯一的切歌检测
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
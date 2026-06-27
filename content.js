// ======================== 工具函数 ========================
function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return '未知';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ======================== 通过歌曲对象获取音频信息（基于质量选项） ========================
async function fetchAudioInfoFromSong(song) {
  if (!song || !song.resolvedQuality || !Array.isArray(song.qualityOptions)) {
    return null;
  }

  const selectedQuality = song.resolvedQuality;
  const qualityItem = song.qualityOptions.find(item => item.value === selectedQuality);
  if (!qualityItem || !qualityItem.hash) {
    console.warn('未找到匹配的质量选项或 hash:', selectedQuality);
    return null;
  }

  const { hash, label } = qualityItem;
  const url = `http://127.0.0.1:6521/audio?hash=${hash}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.status === 1 && Array.isArray(data.data) && data.data.length > 0) {
        const audioData = data.data[0];
        const sizeField = `filesize_${selectedQuality}`;
        const fileSize = audioData[sizeField];

        if (fileSize !== undefined && fileSize !== null) {
          const size = parseInt(fileSize, 10);
          if (!isNaN(size)) {
            return {
              size: size,
              format: label || selectedQuality.toUpperCase()
            };
          }
        }
        console.warn('未找到对应质量的文件大小字段:', sizeField, audioData);
      } else {
        console.warn('接口返回数据异常:', data);
      }
    }
  } catch (err) {
    console.warn('获取音频信息失败:', err);
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

// ======================== 显示逻辑 ========================
let infoDisplay = null;
let currentDisplayHash = null;   // 当前显示的音频对应的 hash

async function updateDisplay() {
  if (!infoDisplay) return;

  const song = getCurrentSong();
  if (!song || !song.resolvedQuality || !Array.isArray(song.qualityOptions)) {
    // 无效歌曲或缺少质量信息时清空显示
    if (currentDisplayHash !== null) {
      currentDisplayHash = null;
      infoDisplay.innerHTML = `<div class="music-format">无音频</div><div class="music-size"></div>`;
    }
    return;
  }

  const selectedQuality = song.resolvedQuality;
  const qualityItem = song.qualityOptions.find(item => item.value === selectedQuality);
  const targetHash = qualityItem ? qualityItem.hash : null;

  // 只有 hash 变化时才更新
  if (targetHash === currentDisplayHash) return;
  currentDisplayHash = targetHash;

  if (!targetHash) {
    infoDisplay.innerHTML = `<div class="music-format">未知</div><div class="music-size"></div>`;
    return;
  }

  // 显示加载中
  infoDisplay.innerHTML = `<div class="music-format">加载中...</div><div class="music-size"></div>`;

  const info = await fetchAudioInfoFromSong(song);
  // 防止异步返回时 hash 已再次变化导致显示错乱
  const currentSong = getCurrentSong();
  const currentQualityItem = currentSong.qualityOptions?.find(item => item.value === currentSong.resolvedQuality);
  const currentHash = currentQualityItem ? currentQualityItem.hash : null;
  if (currentHash !== currentDisplayHash) {
    // 已经切换到别的音频，放弃本次更新
    return;
  }

  if (info && info.size !== null) {
    const format = info.format;
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

    console.log('[音频信息插件] 已启动');
    updateDisplay();
    setInterval(updateDisplay, 1000);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
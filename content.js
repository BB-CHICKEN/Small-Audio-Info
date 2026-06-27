// ==================== 核心统计模块 ====================
(function() {
  'use strict';

  // 【新增】路由检查：只在主页面路由包含 /library 时执行
  // 注意：某些 SPA 可能使用 history.pushState 而不是 hash，如果网站是 Hash 路由则用 location.hash
  // 如果是 History 路由，请改用: if (!location.pathname.includes('/library'))
  if (!location.hash.includes('/library') && !location.pathname.includes('/library')) {
    console.log('[Total-Play-Time] 非主页面 (当前路径: ' + (location.hash || location.pathname) + ')，跳过统计模块');
    return;
  }

  const TOTAL_KEY = 'moekoe_playback_total';     // 存储总秒数
  const STATE_KEY = 'moekoe_playback_state';     // 存储播放状态
  const PROGRESS_KEY = 'player_progress';        // 当前播放进度(key可能因网站更新变动，需确认)
  const CURRENT_SONG_KEY = 'current_song';       // 当前歌曲详细信息 JSON

  // 默认数据
  const defaultTotal = { totalSeconds: 0 };
  const defaultState = {
    lastTrackHash: '',       // 使用 hash 作为唯一ID
    lastPosition: 0,         // 上次记录的播放进度(秒)
    lastCheckTime: 0,        // 上次检查的时间戳(ms)
  };

  // ---------- 读取存储（分离）----------
  function loadTotal() {
    try {
      const raw = localStorage.getItem(TOTAL_KEY);
      if (raw === null) return { ...defaultTotal };
      const data = JSON.parse(raw);
      if (typeof data.totalSeconds === 'number') {
        data.totalSeconds = Math.round(data.totalSeconds * 10) / 10;
      }
      return data;
    } catch (e) {
      console.warn('[Total-Play-Time] 读取总时长失败，使用默认值');
      return { ...defaultTotal };
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (raw === null) return { ...defaultState };
      return JSON.parse(raw);
    } catch (e) {
      console.warn('[Total-Play-Time] 读取状态失败，使用默认值');
      return { ...defaultState };
    }
  }

  // ---------- 保存存储（分离）----------
  function saveTotal(total) {
    try {
      const toSave = { ...total };
      toSave.totalSeconds = Math.round(toSave.totalSeconds * 10) / 10;
      localStorage.setItem(TOTAL_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.error('[[Total-Play-Time]] 保存总时长失败', e);
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('[Total-Play-Time] 保存状态失败', e);
    }
  }

  // 格式化显示
  function formatHM(seconds) {
    if (!seconds || seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}小时 ${mins}分钟` : `${mins}分钟`;
  }

  // 获取当前播放信息 (从 current_song JSON 获取)
  function getCurrentPlaybackInfo() {
    let currentTime = 0;
    let songData = null;

    // 1. 获取当前进度
    try {
      const savedProgress = localStorage.getItem(PROGRESS_KEY);
      if (savedProgress !== null) {
        currentTime = parseFloat(savedProgress);
        if (isNaN(currentTime)) currentTime = 0;
      }
    } catch (e) {}

    // 2. 获取歌曲详情
    try {
      const songRaw = localStorage.getItem(CURRENT_SONG_KEY);
      if (songRaw) {
        songData = JSON.parse(songRaw);
      }
    } catch (e) {}

    // 如果没有有效的歌曲数据，返回 null
    if (!songData || !songData.name) {
      return null;
    }

    return {
      title: songData.name,
      artist: songData.author || '未知艺术家',
      hash: songData.hash || songData.playHash || `${songData.name}|${songData.author}`, // 优先用 hash
      currentTime: currentTime,
      timestamp: Date.now()
    };
  }

  // 核心统计对象
  const stats = {
    _total: loadTotal(),
    _state: loadState(),

    // 每秒更新统计
    update: function() {
      const now = Date.now();
      const track = getCurrentPlaybackInfo();
      const state = this._state;

      // 场景1: 没有正在播放的有效歌曲
      if (!track) {
        // 可选：是否要在这里清空 lastTrackHash？建议保留，以便恢复播放时继续计算
        // 这里我们只更新时间戳，防止恢复播放时时间差过大
        state.lastCheckTime = now;
        saveState(state);
        return;
      }

      const currentHash = track.hash;
      const currentPos = track.currentTime;

      // 场景2: 切歌了 (Hash 变化)
      if (currentHash !== state.lastTrackHash) {
        console.log(`[Total-Play-Time] 检测到切歌: ${track.title}`);
        state.lastTrackHash = currentHash;
        state.lastPosition = currentPos;
        state.lastCheckTime = now;
        saveState(state);
        // 切歌瞬间不累加，防止误差
        return;
      }

      // 场景3: 同一首歌，计算增量
      const timeDiffSec = (now - state.lastCheckTime) / 1000; // 真实流逝时间
      const posDiff = currentPos - state.lastPosition;         // 播放器进度增量

      // 更新检查时间
      state.lastCheckTime = now;

      // 异常处理：posDiff 为负数（用户拖拽后退）或 0（暂停）
      if (posDiff <= 0) {
        // 如果是拖拽后退，更新基准位置，但不累加时长
        if (posDiff < 0) {
           state.lastPosition = currentPos;
        }
        saveState(state);
        return;
      }

      // 核心校验：防止加速播放或系统卡顿导致的错误累加
      // 允许一定的缓冲误差 (例如 2秒)，因为 setInterval 可能不准
      if (posDiff <= timeDiffSec + 2) {
        // 正常播放：累加实际播放的进度差
        this._total.totalSeconds += posDiff;
        state.lastPosition = currentPos;
      } else {
        // 异常情况：进度跳变过大（比如拖拽前进，或者网页刚加载完进度突然同步）
        // 策略：只更新基准位置，不累加这段“瞬移”的时间，防止刷时长
        // 如果希望拖拽前进也算时间（虽然不合理），可以放开下面这行，但通常不建议
        // this._total.totalSeconds += timeDiffSec; 
        state.lastPosition = currentPos;
        console.log('[Total-Play-Time] 检测到进度跳变，已修正基准位置，未累加时长');
      }

      // 确保总时长不为负
      if (this._total.totalSeconds < 0) this._total.totalSeconds = 0;
      
      // 保存
      saveState(state);
      saveTotal(this._total);
    },

    getTotalSeconds: function() {
      return this._total.totalSeconds;
    }
  };

  // 定时更新（每秒）
  const timerId = setInterval(() => stats.update(), 1000);
  
  // 页面卸载前最后更新一次
  window.addEventListener('beforeunload', () => {
    stats.update();
    clearInterval(timerId);
  });

  // 暴露核心对象
  window.MoeKoeStatsCore = {
    getTotalSeconds: stats.getTotalSeconds.bind(stats),
    getFormatted: () => formatHM(stats.getTotalSeconds())
  };

  console.log('[Total-Play-Time] 核心模块已加载');
})();


// ==================== UI 显示模块 ====================
(function() {
  'use strict';

  // 路由检查：只在主页面路由包含 /library 时执行
  if (!location.hash.includes('/library') && !location.pathname.includes('/library')) {
    console.log('[Total-Play-Time] 非主页面，跳过UI模块');
    return;
  }

  const TOTAL_KEY = 'moekoe_playback_total';

  function loadTotal() {
    try {
      const raw = localStorage.getItem(TOTAL_KEY);
      if (!raw) return { totalSeconds: 0 };
      const data = JSON.parse(raw);
      if (typeof data.totalSeconds === 'number') {
        data.totalSeconds = Math.round(data.totalSeconds * 10) / 10;
      }
      return data;
    } catch (e) {
      console.warn('[Total-Play-Time] 读取总时长失败');
      return { totalSeconds: 0 };
    }
  }

  function formatHM(seconds) {
    if (!seconds || seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}小时 ${mins}分钟` : `${mins}分钟`;
  }

  function getDisplayText() {
    const total = loadTotal();
    return `你已使用MoeKoe Music播放 ${formatHM(total.totalSeconds)}`;
  }

  let displayElement = null;

  function updateDisplay() {
    if (displayElement) displayElement.textContent = getDisplayText();
  }

  function ensureDisplayElement() {
    // 仅使用方案 A：寻找带有 Vue scoped 标识的 .user-actions 容器
    let container = null;
    const candidates = document.querySelectorAll('.user-actions');
    for (const div of candidates) {
      const hasVueScope = Array.from(div.attributes).some(attr => attr.name.startsWith('data-v-'));
      if (hasVueScope) {
        container = div;
        break;
      }
    }

    // 未找到符合条件的容器，则不创建元素
    if (!container) {
      // 如果之前有显示元素但容器消失了，可考虑移除或保留，此处简单置空引用
      if (displayElement) {
        displayElement = null;
      }
      return false;
    }

    // 在容器中查找或创建显示元素
    let el = container.querySelector('.moekoe-custom-duration');
    if (!el) {
      el = document.createElement('span');
      el.className = 'moekoe-custom-duration';
      el.title = '累计播放时间';
      el.style.cssText = `
        background-color: rgba(255, 255, 255, 0.2);
        padding: 3px 8px;
        border-radius: 10px;
        color: #fff;
        margin-left: auto;
        font-size: 12px;
        white-space: nowrap;
        cursor: default;
        user-select: none;
        display: inline-flex;
        align-items: center;
      `;
      container.appendChild(el);
    }

    if (displayElement !== el) {
      displayElement = el;
      updateDisplay();
    }
    return true;
  }

  // 监听 DOM 变化以应对 SPA 路由切换
  const observer = new MutationObserver(() => ensureDisplayElement());
  observer.observe(document.body, { childList: true, subtree: true });

  // 初始化
  ensureDisplayElement();

  // 每30秒刷新显示（数据可能在其他标签页更新）
  setInterval(updateDisplay, 30000);

  window.addEventListener('storage', (e) => {
    if (e.key === TOTAL_KEY) {
      updateDisplay();
    }
  });

  window.addEventListener('beforeunload', () => observer.disconnect());

  console.log('[Total-Play-Time] 主页插入成功');
})();
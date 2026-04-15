const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let tray;
let isWindowPinned = false;

// 边缘吸附相关变量
let edgeDockingEnabled = true;
let isEdgeHidden = false;
let hiddenEdge = null; // 'top', 'left', or 'right'
let isMouseInsideWindow = false;
let isWindowShownFromEdge = false; // 窗口是否从边缘展开过
let mouseMonitorTimer = null;
let hideTimer = null;
let animationTimer = null;
let animationTarget = null;
let animationStart = null;
let isAnimating = false;

const DOCK_THRESHOLD = 20; // 吸附边缘的像素距离
const SHOW_THRESHOLD = 30; // 鼠标靠近时显示的像素距离
const HIDE_DELAY = 300; // 鼠标移开后延迟隐藏的时间（毫秒）
const ANIMATION_DURATION = 250; // 动画时长（毫秒）
const VISIBLE_PIXELS = 5; // 隐藏时保留的可见像素

// 数据文件路径
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'todos.json');

// 确保数据目录存在
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// 读取数据
function readTodos() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return { todos: [] };
  } catch (error) {
    console.error('读取数据失败:', error);
    return { todos: [] };
  }
}

// 保存数据
function saveTodos(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存数据失败:', error);
  }
}

// 获取窗口的实际宽度（考虑紧凑模式）
async function getWindowWidth() {
  if (!mainWindow) return 450;
  const [width] = mainWindow.getSize();
  try {
    const isCompactMode = await mainWindow.webContents.executeJavaScript(`
      document.body.classList.contains('compact-mode');
    `);
    // 关键：直接返回 bounds.width（实际窗口宽度）
    // 因为 resize-window 已经设置了窗口的实际宽度
    // 紧凑模式下宽度是250，正常模式下是450
    return width;
  } catch {
    return width;
  }
}

// 获取当前窗口的实际尺寸
async function getWindowBounds() {
  if (!mainWindow) return { x: 0, y: 0, width: 450, height: 800 };

  const [x, y] = mainWindow.getPosition();
  const [width, height] = mainWindow.getSize();
  const windowWidth = await getWindowWidth();

  // 关键：直接使用 width 作为 windowWidth
  // 因为 resize-window 已经正确设置了窗口宽度
  const actualRightEdge = x + windowWidth;

  return { x, y, width, height, windowWidth, rightEdge: actualRightEdge };
}

// 停止当前动画
function stopAnimation() {
  if (animationTimer) {
    clearInterval(animationTimer);
    animationTimer = null;
  }
  isAnimating = false;
  animationTarget = null;
  animationStart = null;
}

// 缓动函数 - easeOutQuart (更平滑的缓动效果)
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

// 窗口位置动画
function animateWindowPosition(targetX, targetY, duration = ANIMATION_DURATION) {
  return new Promise((resolve) => {
    // 检查窗口是否仍然有效
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve();
      return;
    }
    
    // 停止之前的动画
    stopAnimation();
    
    const [currentX, currentY] = mainWindow.getPosition();
    const startTime = Date.now();
    const deltaX = targetX - currentX;
    const deltaY = targetY - currentY;
    
    isAnimating = true;
    animationTarget = { x: targetX, y: targetY };
    animationStart = { x: currentX, y: currentY };
    
    const intervalMs = 10; // 约100fps,更高帧率更流畅
    
    animationTimer = setInterval(() => {
      // 每次检查窗口是否仍然有效
      if (!mainWindow || mainWindow.isDestroyed()) {
        stopAnimation();
        resolve();
        return;
      }
      
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutQuart(progress);
      
      const newX = currentX + deltaX * easedProgress;
      const newY = currentY + deltaY * easedProgress;
      
      try {
        mainWindow.setPosition(Math.round(newX), Math.round(newY));
      } catch (error) {
        console.error('Error setting window position:', error);
        stopAnimation();
        resolve();
        return;
      }
      
      if (progress >= 1) {
        stopAnimation();
        try {
          mainWindow.setPosition(targetX, targetY);
        } catch (error) {
          console.error('Error setting final position:', error);
        }
        resolve();
      }
    }, intervalMs);
  });
}

// 创建窗口
function createWindow() {
  const iconPath = path.join(__dirname, 'static', 'img', 'logo.png');
  mainWindow = new BrowserWindow({
    width: 450,
    height: 800,
    minWidth: 350,
    minHeight: 400,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: true,
    roundedCorners: true,
    titleBarStyle: 'hidden',
    icon: iconPath,
    show: false
  });

  mainWindow.loadFile('index.html');

  // 开发模式下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 默认开启置顶
    mainWindow.setAlwaysOnTop(true);
    isWindowPinned = true;
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 监听鼠标进入/离开窗口
  mainWindow.on('leave', () => {
    isMouseInsideWindow = false;
  });

  mainWindow.on('enter', () => {
    isMouseInsideWindow = true;
  });

  // 启动通知检查
  startNotificationCheck();

  // 启动边缘吸附功能
  startEdgeDocking();
}

// 边缘吸附功能
function startEdgeDocking() {
  if (!edgeDockingEnabled) return;

  // 移除旧的事件监听器（避免重复）
  try {
    mainWindow.removeAllListeners('moved');
    mainWindow.removeAllListeners('resized');
  } catch (e) {
    // 忽略错误
  }
  
  // 监听窗口移动
  mainWindow.on('moved', checkEdgeDocking);

  // 监听窗口大小变化
  mainWindow.on('resized', checkEdgeDocking);

  // 开始鼠标位置监控
  startMouseMonitor();
}

// 检查是否靠近边缘并执行吸附
async function checkEdgeDocking() {
  if (!edgeDockingEnabled || !mainWindow) return;

  const bounds = await getWindowBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const screenBounds = display.bounds;

  // 检查是否在边缘（角落优先检查上边缘）
  const atTop = bounds.y <= DOCK_THRESHOLD;
  const atLeft = bounds.x <= DOCK_THRESHOLD;
  // 对于右边缘，使用windowWidth而不是实际的width
  const atRight = bounds.rightEdge >= screenBounds.width - DOCK_THRESHOLD;

  // 优先级：上边缘 > 左边缘 > 右边缘
  if (atTop && (atLeft || atRight)) {
    // 左上角或右上角，优先吸附到上边缘
    if (!isEdgeHidden || hiddenEdge !== 'top') {
      hideWindowToEdge('top');
    }
  } else if (atTop) {
    // 顶部中间，吸附到上边缘
    if (!isEdgeHidden || hiddenEdge !== 'top') {
      hideWindowToEdge('top');
    }
  } else if (atLeft) {
    // 左边缘，吸附到左边缘
    if (!isEdgeHidden || hiddenEdge !== 'left') {
      hideWindowToEdge('left');
    }
  } else if (atRight) {
    // 右边缘，吸附到右边缘
    if (!isEdgeHidden || hiddenEdge !== 'right') {
      hideWindowToEdge('right');
    }
  } else {
    // 不在边缘，显示窗口
    if (isEdgeHidden) {
      showWindowFromEdge();
    }
  }
}

// 检查窗口是否需要隐藏（当鼠标离开时）
async function checkAndHideWindow() {
  if (!mainWindow || isEdgeHidden) return;

  const bounds = await getWindowBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const screenBounds = display.bounds;

  // 检查是否在边缘（使用rightEdge而不是windowWidth）
  const atTop = bounds.y <= DOCK_THRESHOLD;
  const atLeft = bounds.x <= DOCK_THRESHOLD;
  const atRight = bounds.rightEdge >= screenBounds.width - DOCK_THRESHOLD;

  // 如果在边缘，延迟后隐藏
  if (atTop || atLeft || atRight) {
    // 取消之前的定时器
    if (hideTimer) {
      clearTimeout(hideTimer);
    }

    // 延迟后隐藏
    hideTimer = setTimeout(async () => {
      if (!isMouseInsideWindow) {
        // 重新获取最新位置，因为窗口可能已被移动
        const currentBounds = await getWindowBounds();
        const currentDisplay = screen.getDisplayNearestPoint({ x: currentBounds.x, y: currentBounds.y });
        const currentScreenBounds = currentDisplay.bounds;

        const currentAtTop = currentBounds.y <= DOCK_THRESHOLD;
        const currentAtLeft = currentBounds.x <= DOCK_THRESHOLD;
        const currentAtRight = currentBounds.rightEdge >= currentScreenBounds.width - DOCK_THRESHOLD;

        // 优先级：上边缘 > 左边缘 > 右边缘
        if (currentAtTop && (currentAtLeft || currentAtRight)) {
          await hideWindowToEdge('top');
        } else if (currentAtTop) {
          await hideWindowToEdge('top');
        } else if (currentAtLeft) {
          await hideWindowToEdge('left');
        } else if (currentAtRight) {
          await hideWindowToEdge('right');
        }
      }
    }, HIDE_DELAY);
  }
}

// 隐藏到边缘（带动画）
async function hideWindowToEdge(edge) {
  if (!mainWindow) return;

  // 取消任何待处理的隐藏定时器
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  const bounds = await getWindowBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const screenBounds = display.bounds;

  let targetX, targetY;

  if (edge === 'top') {
    // 隐藏到上边缘，保留5像素可见
    targetX = bounds.x;
    targetY = -bounds.height + VISIBLE_PIXELS;
  } else if (edge === 'left') {
    // 隐藏到左边缘，保留5像素可见
    targetX = -bounds.windowWidth + VISIBLE_PIXELS;
    targetY = bounds.y;
  } else {
    // 隐藏到右边缘，保留5像素可见
    targetX = screenBounds.width - VISIBLE_PIXELS;
    targetY = bounds.y;
  }

  // 使用滑动动画
  await animateWindowPosition(targetX, targetY).then(() => {
    isEdgeHidden = true;
    isWindowShownFromEdge = true; // 保持标记为true，允许重复触发
    hiddenEdge = edge;
  });
}

// 从边缘显示窗口（带动画）
async function showWindowFromEdge() {
  if (!mainWindow || !isEdgeHidden) return;

  const bounds = await getWindowBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const screenBounds = display.bounds;

  let targetX, targetY;

  if (hiddenEdge === 'top') {
    // 上边缘：保持在当前x位置，y移动到0
    targetX = bounds.x;
    targetY = 0;
  } else if (hiddenEdge === 'left') {
    // 左边缘：x移动到0，保持在当前y位置
    targetX = 0;
    targetY = bounds.y;
  } else {
    // 右边缘：x移动到屏幕右侧减去窗口宽度，保持在当前y位置
    // 关键：使用 windowWidth（显示宽度）来计算显示位置
    targetX = screenBounds.width - bounds.windowWidth;
    targetY = bounds.y;
  }

  // 使用滑动动画
  await animateWindowPosition(targetX, targetY).then(() => {
    isEdgeHidden = false;
    isWindowShownFromEdge = true; // 标记窗口已从边缘展开
    hiddenEdge = null;
  });
}

// 从边缘显示窗口并显示彩虹边框效果（托盘点击时使用）
async function showWindowFromEdgeWithGlow() {
  if (!mainWindow || !isEdgeHidden) return;

  const bounds = await getWindowBounds();
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
  const screenBounds = display.bounds;

  let targetX, targetY;

  if (hiddenEdge === 'top') {
    targetX = bounds.x;
    targetY = 0;
  } else if (hiddenEdge === 'left') {
    targetX = 0;
    targetY = bounds.y;
  } else {
    targetX = screenBounds.width - bounds.windowWidth;
    targetY = bounds.y;
  }

  // 先显示窗口（不聚焦，等动画完成）
  mainWindow.show();
  
  // 清除可能残留的fade-out类
  mainWindow.webContents.executeJavaScript(`
    document.body.classList.remove('fade-out');
  `);
  
  // 使用滑动动画
  await animateWindowPosition(targetX, targetY).then(() => {
    isEdgeHidden = false;
    isWindowShownFromEdge = true;
    hiddenEdge = null;
    
    // 动画完成后触发彩虹边框效果
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript(`
          if (typeof showRainbowBorder === 'function') {
            showRainbowBorder(0.5);
          }
        `).catch(err => console.log('Rainbow border error:', err));
      }
    }, 100);
  });
  
  mainWindow.focus();
}

// 开始鼠标监控
function startMouseMonitor() {
  if (mouseMonitorTimer) {
    clearInterval(mouseMonitorTimer);
  }

  mouseMonitorTimer = setInterval(async () => {
    // 获取全局鼠标位置
    const mousePosition = screen.getCursorScreenPoint();

    // 检查鼠标是否在窗口内（使用全局鼠标位置）
    if (mainWindow) {
      const [x, y] = mainWindow.getPosition();
      const [width, height] = mainWindow.getSize();

      // 判断鼠标是否在窗口范围内
      const isInsideWindow =
        mousePosition.x >= x &&
        mousePosition.x <= x + width &&
        mousePosition.y >= y &&
        mousePosition.y <= y + height;

      // 更新鼠标在窗口内的状态
      if (isInsideWindow !== isMouseInsideWindow) {
        isMouseInsideWindow = isInsideWindow;

        // 如果鼠标进入窗口，取消待处理的隐藏定时器
        if (isMouseInsideWindow && hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }

        // 如果鼠标离开窗口且窗口已从边缘展开，检查是否需要隐藏
        if (!isMouseInsideWindow && isWindowShownFromEdge && !isEdgeHidden) {
          checkAndHideWindow();
        }
      }
    }

    // 检查1：如果窗口已隐藏，检测鼠标是否靠近窗口区域以显示窗口
    if (isEdgeHidden) {
      const bounds = await getWindowBounds();
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      const screenBounds = display.bounds;

      // 检查鼠标是否靠近隐藏的窗口
      let shouldShow = false;

      if (hiddenEdge === 'top') {
        // 检查鼠标是否靠近上边缘
        if (mousePosition.y <= SHOW_THRESHOLD) {
          shouldShow = true;
        }
        // 检查鼠标的X范围（使用windowWidth）
        if (shouldShow && (mousePosition.x < bounds.x || mousePosition.x > bounds.x + bounds.windowWidth)) {
          shouldShow = false;
        }
      } else if (hiddenEdge === 'left') {
        // 检查鼠标是否靠近左边缘
        if (mousePosition.x <= SHOW_THRESHOLD) {
          shouldShow = true;
        }
        // 检查鼠标的Y范围
        if (shouldShow && (mousePosition.y < bounds.y || mousePosition.y > bounds.y + bounds.height)) {
          shouldShow = false;
        }
      } else if (hiddenEdge === 'right') {
        // 检查鼠标是否靠近右边缘
        if (mousePosition.x >= screenBounds.width - SHOW_THRESHOLD) {
          shouldShow = true;
        }
        // 检查鼠标的Y范围
        if (shouldShow && (mousePosition.y < bounds.y || mousePosition.y > bounds.y + bounds.height)) {
          shouldShow = false;
        }
      }

      if (shouldShow) {
        showWindowFromEdge();
      }
    }
  }, 100);
}

// 停止鼠标监控
function stopMouseMonitor() {
  if (mouseMonitorTimer) {
    clearInterval(mouseMonitorTimer);
    mouseMonitorTimer = null;
  }
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  stopAnimation();
}

// 切换边缘吸附功能
function toggleEdgeDocking(enabled) {
  edgeDockingEnabled = enabled;
  if (enabled) {
    startEdgeDocking();
  } else {
    stopMouseMonitor();
    if (isEdgeHidden) {
      showWindowFromEdge();
    }
    isWindowShownFromEdge = false;
  }
}

// 创建托盘图标
function createTray() {
  const trayIconPath = path.join(__dirname, 'static', 'img', 'logo.png');
  const trayIcon = nativeImage.createFromPath(trayIconPath);

  // 创建不同尺寸的图标
  const sizes = [16, 32, 64];
  const iconSet = [];

  sizes.forEach(size => {
    const resizedIcon = trayIcon.resize({ width: size, height: size });
    iconSet.push(resizedIcon);
  });

  // 在Windows上使用圆形遮罩
  if (process.platform === 'win32') {
    const size = 32;
    const circularIcon = trayIcon.resize({ width: size, height: size });
    tray = new Tray(circularIcon);
  } else {
    // macOS和Linux使用系统默认处理
    tray = new Tray(trayIcon);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (isEdgeHidden) {
          showWindowFromEdgeWithGlow();
        } else {
          mainWindow.show();
          mainWindow.focus();
          // 清除可能残留的fade-out类
          mainWindow.webContents.executeJavaScript(`
            document.body.classList.remove('fade-out');
          `);
          // 非吸附状态下也显示彩虹边框提醒
          setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.executeJavaScript(`
                if (typeof showRainbowBorder === 'function') {
                  showRainbowBorder(0.5);
                }
              `).catch(err => console.log('Rainbow border error:', err));
            }
          }, 100);
        }
      }
    },
    {
      label: '设置',
      click: () => {
        showSettings();
      }
    },
    {
      label: '退出',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Todooooo - 待办事项');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    // 托盘点击只显示窗口，不最小化
    if (!mainWindow.isVisible()) {
      // 检查是否处于边缘吸附状态
      if (isEdgeHidden) {
        // 从边缘滑出并显示彩虹边框
        showWindowFromEdgeWithGlow();
      } else {
        // 普通显示窗口并渐入
        mainWindow.show();
        mainWindow.focus();
        // 先移除fade-out，再添加fade-in，确保动画正确触发
        mainWindow.webContents.executeJavaScript(`
          document.body.classList.remove('fade-out');
          document.body.classList.add('fade-in');
          setTimeout(() => {
            document.body.classList.remove('fade-in');
          }, 300);
        `);
      }
    } else {
      // 窗口已可见，只聚焦不隐藏
      mainWindow.focus();
    }
  });
}

// IPC 事件处理
ipcMain.handle('get-todos', () => {
  return readTodos();
});

ipcMain.handle('save-todos', (event, data) => {
  saveTodos(data);
  return { success: true };
});

ipcMain.handle('pin-window', (event, pinned) => {
  isWindowPinned = pinned;
  mainWindow.setAlwaysOnTop(pinned);
  return { success: true, pinned };
});

ipcMain.handle('is-window-pinned', () => {
  return { pinned: isWindowPinned };
});

// 边缘吸附相关 IPC
ipcMain.handle('toggle-edge-docking', (event, enabled) => {
  toggleEdgeDocking(enabled);
  return { success: true, enabled };
});

ipcMain.handle('get-edge-docking-status', () => {
  return { enabled: edgeDockingEnabled, hidden: isEdgeHidden, edge: hiddenEdge };
});

ipcMain.handle('show-from-edge', () => {
  if (isEdgeHidden) {
    showWindowFromEdge();
  }
  return { success: true };
});


// 最小化窗口
ipcMain.handle('minimize-window', async () => {
  if (mainWindow) {
    // 先执行渐出动画
    mainWindow.webContents.executeJavaScript(`
      document.body.classList.add('fade-out');
    `);

    // 等待动画完成
    await new Promise(resolve => setTimeout(resolve, 300));

    mainWindow.hide();
  }
  return { success: true };
});

// 调整窗口大小
ipcMain.on('resize-window', (event, width, height) => {
  if (mainWindow) {
    mainWindow.setSize(width, height);
  }
});

// 通知检查定时器
let notificationCheckInterval;

// 启动通知检查
function startNotificationCheck() {
  // 每分钟检查一次
  notificationCheckInterval = setInterval(() => {
    checkNotifications();
  }, 60000);
}

// 检查通知
function checkNotifications() {
  try {
    const data = readTodos();
    if (!data.todos) return;

    const now = new Date();
    data.todos.forEach(todo => {
      if (todo.dueDate && !todo.completed) {
        const dueDate = new Date(todo.dueDate);
        const timeDiff = dueDate - now;

        // 到期前1小时提醒
        if (timeDiff > 0 && timeDiff < 3600000 && !todo.notified) {
          sendNotification(`任务即将到期: ${todo.text}`);
          todo.notified = true;
          saveTodos(data);
        }

        // 已过期提醒
        if (timeDiff < 0 && Math.abs(timeDiff) < 3600000 && !todo.overdueNotified) {
          sendNotification(`任务已过期: ${todo.text}`);
          todo.overdueNotified = true;
          saveTodos(data);
        }
      }
    });
  } catch (error) {
    console.error('检查通知失败:', error);
  }
}

// 发送通知
function sendNotification(message) {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: 'Todooooo - 待办事项',
      body: message
    });

    notification.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    notification.show();
  }
}

// 设置窗口
let settingsWindow = null;

// 显示设置窗口
function showSettings() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  const iconPath = path.join(__dirname, 'static', 'img', 'logo.png');
  settingsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    minWidth: 350,
    minHeight: 400,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: true,
    roundedCorners: true,
    titleBarStyle: 'hidden',
    icon: iconPath,
    parent: mainWindow,
    modal: true,
    show: false
  });

  settingsWindow.loadFile('settings.html');

  settingsWindow.once('ready-to-show', async () => {
    // 如果主窗口处于边缘隐藏状态,将设置窗口居中显示在屏幕上
    if (isEdgeHidden && mainWindow) {
      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const screenBounds = display.bounds;
      
      // 计算居中位置
      const settingsWidth = 400;
      const settingsHeight = 500;
      const x = Math.round(screenBounds.x + (screenBounds.width - settingsWidth) / 2);
      const y = Math.round(screenBounds.y + (screenBounds.height - settingsHeight) / 2);
      
      settingsWindow.setPosition(x, y);
    }
    
    settingsWindow.show();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// 设置相关的IPC处理
ipcMain.handle('get-settings', () => {
  const settingsFile = path.join(DATA_DIR, 'settings.json');
  try {
    if (fs.existsSync(settingsFile)) {
      const data = fs.readFileSync(settingsFile, 'utf-8');
      return JSON.parse(data);
    }
    return {
      theme: 'light',
      opacity: 95,
      accentColor: '#5b6cf7',
      edgeDocking: true
    };
  } catch (error) {
    console.error('读取设置失败:', error);
    return {
      theme: 'light',
      opacity: 95,
      accentColor: '#5b6cf7',
      edgeDocking: true
    };
  }
});

ipcMain.handle('save-settings', (event, settings) => {
  const settingsFile = path.join(DATA_DIR, 'settings.json');
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');

    // 应用边缘吸附设置
    if (settings.edgeDocking !== undefined) {
      edgeDockingEnabled = settings.edgeDocking;
      if (edgeDockingEnabled) {
        startEdgeDocking();
      } else {
        stopMouseMonitor();
        if (isEdgeHidden) {
          showWindowFromEdge();
        }
      }
    }

    // 应用设置到主窗口
    if (mainWindow) {
      mainWindow.webContents.send('settings-changed', settings);
    }

    return { success: true };
  } catch (error) {
    console.error('保存设置失败:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.close();
  }
  return { success: true };
});

// 应用启动
app.whenReady().then(() => {
  ensureDataDir();
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 应用退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  // 清理托盘
  if (tray) {
    tray.destroy();
  }

  // 清理定时器
  if (notificationCheckInterval) {
    clearInterval(notificationCheckInterval);
  }

  // 清理边缘吸附定时器
  stopMouseMonitor();

  // 渐出效果
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`
      document.body.classList.add('fade-out');
    `);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
});

const { ipcRenderer } = require('electron');

// 当前设置
let currentSettings = {
  theme: 'light',
  opacity: 95,
  accentColor: '#5b6cf7',
  edgeDocking: true
};

// 初始化设置
async function initSettings() {
  try {
    // 加载当前设置
    const settings = await ipcRenderer.invoke('get-settings');
    currentSettings = { ...currentSettings, ...settings };

    // 标准化透明度值：如果是小数（如 0.95），转换为整数（如 95）
    if (currentSettings.opacity < 10) {
      currentSettings.opacity = Math.round(currentSettings.opacity * 100);
    }

    // 更新UI显示
    updateUI();

    // 设置事件监听器
    setupEventListeners();
  } catch (error) {
    console.error('初始化设置失败:', error);
  }
}

// 更新UI显示
function updateUI() {
  // 更新主题选择
  document.querySelectorAll('.theme-option').forEach(option => {
    option.classList.toggle('selected', option.dataset.theme === currentSettings.theme);
  });

  // 更新颜色选择
  document.querySelectorAll('.color-option').forEach(option => {
    option.classList.toggle('selected', option.dataset.color === currentSettings.accentColor);
  });

  // 更新透明度滑块
  const opacitySlider = document.getElementById('opacitySlider');
  const opacityValue = document.getElementById('opacityValue');

  // 标准化透明度值：确保在 30-100 范围内
  let displayValue = currentSettings.opacity;
  if (displayValue < 10) {
    // 如果是小数（如 0.95），转换为整数（如 95）
    displayValue = Math.round(displayValue * 100);
  }

  // 确保值在有效范围内
  if (displayValue < 30) displayValue = 30;
  if (displayValue > 100) displayValue = 100;

  opacitySlider.value = displayValue;
  opacityValue.textContent = displayValue + '%';

  console.log('Opacity display:', displayValue, 'Original:', currentSettings.opacity);

  // 更新边缘吸附开关
  const edgeDockingSwitch = document.getElementById('edgeDockingSwitch');
  if (edgeDockingSwitch) {
    edgeDockingSwitch.checked = currentSettings.edgeDocking;
  }

  // 应用当前设置到页面
  applySettingsToPage();
}

// 应用设置到页面
function applySettingsToPage() {
  // 设置CSS变量
  document.documentElement.style.setProperty('--accent-color', currentSettings.accentColor);

  // 设置data-color属性以便CSS变量规则生效
  document.documentElement.setAttribute('data-color', currentSettings.accentColor);

  // 应用主题
  document.body.className = currentSettings.theme === 'light' ? 'light-theme' : '';

  // 设置页面不受透明度影响，始终保持不透明
  const settingsContainer = document.querySelector('.settings-container');
  if (settingsContainer) {
    settingsContainer.style.opacity = 1;
  }

  // 计算RGB值用于hover效果
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '91, 108, 247';
  };
  document.documentElement.style.setProperty('--accent-color-rgb', hexToRgb(currentSettings.accentColor));
}

// 设置事件监听器
function setupEventListeners() {
  // 主题选择
  document.querySelectorAll('.theme-option').forEach(option => {
    option.addEventListener('click', () => {
      currentSettings.theme = option.dataset.theme;
      updateUI();
    });
  });

  // 颜色选择
  document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', () => {
      currentSettings.accentColor = option.dataset.color;
      updateUI();
    });
  });

  // 边缘吸附开关
  const edgeDockingSwitch = document.getElementById('edgeDockingSwitch');
  if (edgeDockingSwitch) {
    edgeDockingSwitch.addEventListener('change', (e) => {
      currentSettings.edgeDocking = e.target.checked;
      updateUI();
    });
  }

  // 透明度滑块
  const opacitySlider = document.getElementById('opacitySlider');
  const opacityValue = document.getElementById('opacityValue');

  opacitySlider.addEventListener('input', () => {
    currentSettings.opacity = parseInt(opacitySlider.value);
    opacityValue.textContent = currentSettings.opacity + '%';
    applySettingsToPage();
  });

  // 保存按钮
  document.getElementById('saveSettings').addEventListener('click', saveSettings);

  // 重置按钮
  document.getElementById('resetSettings').addEventListener('click', resetSettings);

  // 关闭按钮
  document.getElementById('closeSettings').addEventListener('click', closeSettings);

  // 键盘事件
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettings();
    }
  });
}

// 保存设置
async function saveSettings() {
  try {
    const result = await ipcRenderer.invoke('save-settings', currentSettings);
    if (result.success) {
      showMessage('设置已保存', 'success');
      setTimeout(() => {
        closeSettings();
      }, 1000);
    } else {
      showMessage('保存失败: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('保存设置失败:', error);
    showMessage('保存失败', 'error');
  }
}

// 重置设置
async function resetSettings() {
  const confirmed = await showCustomConfirm('重置设置', '确定要重置所有设置为默认值吗？');
  if (confirmed) {
    currentSettings = {
      theme: 'light',
      opacity: 95,
      accentColor: '#5b6cf7',
      edgeDocking: true
    };
    updateUI();
    // 保存设置到文件并应用到主窗口
    await saveSettings();
    showMessage('设置已重置', 'success');
  }
}

// 显示自定义确认弹窗
async function showCustomConfirm(title, message) {
  return new Promise((resolve) => {
    // 创建自定义弹窗
    const dialog = document.createElement('div');
    dialog.className = 'custom-confirm-dialog';

    const titleEl = document.createElement('div');
    titleEl.className = 'custom-confirm-dialog-title';
    titleEl.textContent = title;

    const messageEl = document.createElement('div');
    messageEl.className = 'custom-confirm-dialog-message';
    messageEl.textContent = message;

    const buttonsEl = document.createElement('div');
    buttonsEl.className = 'custom-confirm-dialog-buttons';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'custom-confirm-dialog-btn custom-confirm-dialog-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = () => {
      dialog.remove();
      resolve(false);
    };

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'custom-confirm-dialog-btn custom-confirm-dialog-btn-confirm';
    confirmBtn.textContent = '确定';
    confirmBtn.onclick = () => {
      dialog.remove();
      resolve(true);
    };

    buttonsEl.appendChild(cancelBtn);
    buttonsEl.appendChild(confirmBtn);

    dialog.appendChild(titleEl);
    dialog.appendChild(messageEl);
    dialog.appendChild(buttonsEl);

    document.body.appendChild(dialog);

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
        resolve(false);
      }
    });

    // ESC键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        dialog.remove();
        resolve(false);
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
  });
}

// 关闭设置窗口
async function closeSettings() {
  try {
    await ipcRenderer.invoke('close-settings');
  } catch (error) {
    console.error('关闭设置窗口失败:', error);
  }
}

// 显示消息
function showMessage(message, type = 'info') {
  // 创建消息元素
  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}`;
  messageEl.textContent = message;
  messageEl.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${type === 'error' ? '#ff6b6b' : '#4CAF50'};
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    font-size: 14px;
    animation: slideDown 0.3s ease;
  `;

  document.body.appendChild(messageEl);

  // 3秒后自动移除
  setTimeout(() => {
    messageEl.style.animation = 'slideUp 0.3s ease';
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.parentNode.removeChild(messageEl);
      }
    }, 300);
  }, 3000);

  // 添加动画样式
  if (!document.querySelector('#message-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'message-styles';
    styleEl.textContent = `
      @keyframes slideDown {
        from {
          transform: translateX(-50%) translateY(-20px);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }

      @keyframes slideUp {
        from {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
        to {
          transform: translateX(-50%) translateY(-20px);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }
}

// 启动设置
initSettings();

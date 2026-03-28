const { ipcRenderer } = require('electron');

// 数据存储
let todos = [];
let isPinned = false;

// DOM 元素
const todoInput = document.getElementById('todoInput');
const addBtn = document.getElementById('addBtn');
const todoList = document.getElementById('todoList');
const emptyState = document.getElementById('emptyState');
const pinBtn = document.getElementById('pinBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const compactBtn = document.getElementById('compactBtn');
const addTodoSection = document.getElementById('addTodoSection');
const statsSection = document.getElementById('statsSection');
const totalTodos = document.getElementById('totalTodos');
const completedTodos = document.getElementById('completedTodos');
const pendingTodos = document.getElementById('pendingTodos');
const dueDateInput = document.getElementById('dueDateInput');
const priorityBtns = document.querySelectorAll('.priority-btn');

// 当前选中的优先级
let currentPriority = 'medium';

// 紧凑模式状态
let isCompactMode = false;

// 编辑的待办事项ID
let editingTodoId = null;

// 初始化
async function init() {
  await loadTodos();
  await checkPinStatus();
  renderTodos();
  setupEventListeners();
}

// 加载待办事项
async function loadTodos() {
  const data = await ipcRenderer.invoke('get-todos');
  todos = data.todos || [];
}

// 检查置顶状态
async function checkPinStatus() {
  const result = await ipcRenderer.invoke('is-window-pinned');
  isPinned = result.pinned;
  updatePinButton();
}

// 保存待办事项
async function saveTodos() {
  await ipcRenderer.invoke('save-todos', { todos });
  updateStats();
}

// 获取日期的显示文本
function getDisplayDate(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (targetDate.getTime() === today.getTime()) {
    return '今天';
  } else if (targetDate.getTime() === yesterday.getTime()) {
    return '昨天';
  } else if (targetDate.getTime() === tomorrow.getTime()) {
    return '明天';
  } else {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const weekDay = weekDays[date.getDay()];
    return `${month}月${day}日 周${weekDay}`;
  }
}

// 渲染待办事项列表
function renderTodos() {
  todoList.innerHTML = '';

  if (todos.length === 0) {
    emptyState.classList.add('show');
    todoList.style.display = 'none';
  } else {
    emptyState.classList.remove('show');
    todoList.style.display = 'flex';

    // 按创建日期分组
    const groupedTodos = {};
    todos.forEach(todo => {
      const createDate = new Date(todo.createdAt);
      const dateKey = createDate.toDateString();
      if (!groupedTodos[dateKey]) {
        groupedTodos[dateKey] = [];
      }
      groupedTodos[dateKey].push(todo);
    });

    // 按日期排序（最新的在前）
    const sortedDates = Object.keys(groupedTodos).sort((a, b) => {
      return new Date(b) - new Date(a);
    });

    // 渲染每个日期组
    sortedDates.forEach(dateKey => {
      const dateTodos = groupedTodos[dateKey];
      const date = new Date(dateKey);
      const today = new Date();
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const yesterday = new Date(todayDate);
      yesterday.setDate(yesterday.getDate() - 1);

      // 创建日期标题
      const dateHeader = document.createElement('div');
      dateHeader.className = 'date-group-header';
      if (date.getTime() === todayDate.getTime()) {
        dateHeader.classList.add('today');
      } else if (date.getTime() === yesterday.getTime()) {
        dateHeader.classList.add('yesterday');
      }
      dateHeader.textContent = getDisplayDate(date);
      todoList.appendChild(dateHeader);

      // 对该日期下的任务排序
      dateTodos.sort((a, b) => {
        // 未完成的在前
        if (a.completed !== b.completed) return a.completed ? 1 : -1;

        // 按优先级排序
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityA = priorityOrder[a.priority] || 1;
        const priorityB = priorityOrder[b.priority] || 1;
        if (priorityA !== priorityB) return priorityA - priorityB;

        // 按创建时间排序
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

      // 渲染该日期下的所有任务
      dateTodos.forEach(todo => {
        const todoItem = createTodoElement(todo);
        todoList.appendChild(todoItem);
      });
    });
  }

  updateStats();
}

// 创建待办事项元素
function createTodoElement(todo) {
  const item = document.createElement('div');
  item.className = `todo-item ${todo.completed ? 'completed' : ''} ${isCompactMode ? 'compact' : ''}`;
  item.dataset.id = todo.id;

  // 紧凑模式：只有复选框和文本
  if (isCompactMode) {
    const mainContent = document.createElement('div');
    mainContent.className = 'todo-item-main';

    // 颜色圈圈（优先级指示器）
    const priorityCircle = document.createElement('div');
    priorityCircle.className = `priority-circle ${todo.priority}`;
    
    const checkbox = document.createElement('div');
    checkbox.className = `todo-checkbox ${todo.completed ? 'checked' : ''}`;
    checkbox.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    `;
    checkbox.addEventListener('click', () => toggleTodo(todo.id));

    const text = document.createElement('div');
    text.className = 'todo-text';
    text.textContent = todo.text;

    mainContent.appendChild(priorityCircle);
    mainContent.appendChild(checkbox);
    mainContent.appendChild(text);
    item.appendChild(mainContent);
    
    return item;
  }

  // 普通模式：完整功能
  const mainContent = document.createElement('div');
  mainContent.className = 'todo-item-main';

  const checkbox = document.createElement('div');
  checkbox.className = `todo-checkbox ${todo.completed ? 'checked' : ''}`;
  checkbox.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
  checkbox.addEventListener('click', () => toggleTodo(todo.id));

  const text = document.createElement('div');
  text.className = 'todo-text';
  text.textContent = todo.text;

  const actions = document.createElement('div');
  actions.className = 'todo-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'todo-action-btn edit';
  editBtn.title = '编辑';
  editBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `;
  editBtn.addEventListener('click', () => startEdit(todo.id));

  const priorityBtn = document.createElement('button');
  priorityBtn.className = 'todo-action-btn edit';
  priorityBtn.title = '修改优先级';
  priorityBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
      <path d="M2 17l10 5 10-5"></path>
      <path d="M2 12l10 5 10-5"></path>
    </svg>
  `;
  priorityBtn.addEventListener('click', () => changePriority(todo.id));

  const addSubtaskBtn = document.createElement('button');
  addSubtaskBtn.className = 'todo-action-btn edit';
  addSubtaskBtn.title = '添加子任务';
  addSubtaskBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  `;
  addSubtaskBtn.addEventListener('click', () => addSubtask(todo.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'todo-action-btn delete';
  deleteBtn.title = '删除';
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;
  deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

  actions.appendChild(editBtn);
  actions.appendChild(priorityBtn);
  actions.appendChild(addSubtaskBtn);
  actions.appendChild(deleteBtn);

  mainContent.appendChild(checkbox);
  mainContent.appendChild(text);
  mainContent.appendChild(actions);

  // 元数据区（优先级、截止日期）
  const metaContent = document.createElement('div');
  metaContent.className = 'todo-item-meta';

  // 普通模式下的详细元数据
  if (todo.priority) {
    const priorityLabel = document.createElement('span');
    priorityLabel.className = `meta-tag priority-${todo.priority}`;
    const priorityText = { high: '高优先级', medium: '中优先级', low: '低优先级' };
    priorityLabel.textContent = priorityText[todo.priority];
    metaContent.appendChild(priorityLabel);
  }

  // 截止日期标签
  if (todo.dueDate) {
    const dueDateLabel = document.createElement('span');
    dueDateLabel.className = 'meta-tag due-date';

    const now = new Date();
    const dueDate = new Date(todo.dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

    let dateText;
    if (dueDay < today) {
      dueDateLabel.classList.add('overdue');
      dateText = '⚠️ 已逾期 ' + formatDate(dueDate);
    } else if (dueDay.getTime() === today.getTime()) {
      dueDateLabel.classList.add('today');
      dateText = '🔔 今天截止 ' + formatTime(dueDate);
    } else {
      dateText = '📅 ' + formatDate(dueDate);
    }

    dueDateLabel.textContent = dateText;
    metaContent.appendChild(dueDateLabel);
  }

  // 子任务计数
  if (todo.subtasks && todo.subtasks.length > 0) {
    const subtaskLabel = document.createElement('span');
    subtaskLabel.className = 'meta-tag';
    const completed = todo.subtasks.filter(s => s.completed).length;
    subtaskLabel.textContent = `📝 子任务 ${completed}/${todo.subtasks.length}`;
    metaContent.appendChild(subtaskLabel);
  }

  // 子任务容器
  let subtasksContainer = null;
  if (todo.subtasks && todo.subtasks.length > 0) {
    subtasksContainer = createSubtasksContainer(todo);
  }

  item.appendChild(mainContent);
  if (metaContent.children.length > 0) {
    item.appendChild(metaContent);
  }
  if (subtasksContainer) {
    item.appendChild(subtasksContainer);
  }

  return item;
}

// 添加待办事项
function addTodo() {
  const text = todoInput.value.trim();
  if (!text) return;

  const todo = {
    id: Date.now(),
    text: text,
    completed: false,
    priority: currentPriority,
    dueDate: dueDateInput.value || null,
    subtasks: [],
    createdAt: new Date().toISOString()
  };

  todos.unshift(todo);
  saveTodos();
  renderTodos();

  // 重置输入
  todoInput.value = '';
  dueDateInput.value = '';
  currentPriority = 'medium';
  priorityBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.priority === 'medium');
  });
  todoInput.focus();
}

// 切换待办事项完成状态
function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    saveTodos();
    renderTodos();
  }
}

// 删除待办事项
function deleteTodo(id) {
  todos = todos.filter(t => t.id !== id);
  saveTodos();
  renderTodos();
}

// 修改待办事项优先级
function changePriority(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  const priorities = ['low', 'medium', 'high'];
  const currentIndex = priorities.indexOf(todo.priority);
  const nextIndex = (currentIndex + 1) % priorities.length;
  const newPriority = priorities[nextIndex];

  todo.priority = newPriority;

  saveTodos();
  renderTodos();

  // 显示提示
  const priorityNames = { low: '低', medium: '中', high: '高' };
  const priorityColors = { low: '🟢', medium: '🟡', high: '🔴' };
  showToast(`优先级已改为 ${priorityColors[newPriority]} ${priorityNames[newPriority]}`);
}

// 显示提示消息
function showToast(message) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// 开始编辑
function startEdit(id) {
  const item = document.querySelector(`[data-id="${id}"]`);
  if (!item) return;

  const todo = todos.find(t => t.id === id);
  if (!todo) return;

  const textElement = item.querySelector('.todo-text');
  const currentText = todo.text;

  // 创建编辑输入框
  const editInput = document.createElement('input');
  editInput.type = 'text';
  editInput.className = 'edit-input';
  editInput.value = currentText;

  // 创建编辑操作按钮
  const editActions = document.createElement('div');
  editActions.className = 'edit-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.title = '保存';
  saveBtn.innerHTML = '✓';
  saveBtn.addEventListener('click', () => {
    const newText = editInput.value.trim();
    if (newText) {
      todo.text = newText;
      saveTodos();
      renderTodos();
    }
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-btn';
  cancelBtn.title = '取消';
  cancelBtn.innerHTML = '✕';
  cancelBtn.addEventListener('click', () => {
    renderTodos();
  });

  editActions.appendChild(saveBtn);
  editActions.appendChild(cancelBtn);

  // 替换显示内容
  textElement.innerHTML = '';
  textElement.appendChild(editInput);
  textElement.appendChild(editActions);

  // 隐藏操作按钮
  const actions = item.querySelector('.todo-actions');
  actions.style.display = 'none';

  editInput.focus();
  editInput.select();

  // 支持回车保存，ESC取消
  editInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveBtn.click();
    } else if (e.key === 'Escape') {
      cancelBtn.click();
    }
  });
}

// 更新统计信息
function updateStats() {
  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;
  const pending = total - completed;

  totalTodos.textContent = total;
  completedTodos.textContent = completed;
  pendingTodos.textContent = pending;
}

// 更新置顶按钮状态
function updatePinButton() {
  if (isPinned) {
    pinBtn.classList.add('active');
  } else {
    pinBtn.classList.remove('active');
  }
}

// 切换窗口置顶
async function togglePin() {
  isPinned = !isPinned;
  await ipcRenderer.invoke('pin-window', isPinned);
  updatePinButton();
}

// 设置事件监听器
function setupEventListeners() {
  // 添加按钮
  addBtn.addEventListener('click', addTodo);

  // 输入框回车事件
  todoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addTodo();
    }
  });

  // 优先级选择
  priorityBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      priorityBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPriority = btn.dataset.priority;
    });
  });

  // 置顶按钮
  pinBtn.addEventListener('click', togglePin);

  // 最小化到托盘按钮
  minimizeBtn.addEventListener('click', async () => {
    const { ipcRenderer } = require('electron');
    await ipcRenderer.invoke('minimize-window');
  });

  // 紧凑视图按钮
  compactBtn.addEventListener('click', toggleCompactMode);

  // 切换紧凑模式
  function toggleCompactMode() {
    isCompactMode = !isCompactMode;
    updateCompactView();
  }

  // 更新紧凑视图
  function updateCompactView() {
    if (isCompactMode) {
      document.body.classList.add('compact-mode');
      compactBtn.classList.add('active');

      // 计算合适的窗口高度（简化版）
      const itemCount = todos.length;
      const headerHeight = 40;
      const itemHeight = 32;
      const padding = 24;
      const minHeight = headerHeight + padding + Math.min(itemCount, 15) * itemHeight;
      const newHeight = Math.max(minHeight, 300);

      // 调整窗口大小
      ipcRenderer.send('resize-window', 250, newHeight);
      
      // 1. 紧凑布局下，compactBtn下的svg的viewBox设为0 2 24 24
      const compactBtnSvg = compactBtn.querySelector('svg');
      if (compactBtnSvg) {
        compactBtnSvg.setAttribute('viewBox', '0 2 24 24');
      }
      
      // 2. 紧凑布局下，minimizeBtn下的svg的line设为x1="5" y1="10" x2="20" y2="10"
      const minimizeBtnSvg = minimizeBtn.querySelector('svg');
      if (minimizeBtnSvg) {
        const line = minimizeBtnSvg.querySelector('line');
        if (line) {
          line.setAttribute('x1', '5');
          line.setAttribute('y1', '10');
          line.setAttribute('x2', '20');
          line.setAttribute('y2', '10');
        }
      }
    } else {
      document.body.classList.remove('compact-mode');
      compactBtn.classList.remove('active');

      // 恢复正常窗口大小
      ipcRenderer.send('resize-window', 450, 800);
      
      // 恢复svg的默认设置
      const compactBtnSvg = compactBtn.querySelector('svg');
      if (compactBtnSvg) {
        compactBtnSvg.setAttribute('viewBox', '0 0 24 24');
      }
      
      const minimizeBtnSvg = minimizeBtn.querySelector('svg');
      if (minimizeBtnSvg) {
        const line = minimizeBtnSvg.querySelector('line');
        if (line) {
          line.setAttribute('x1', '5');
          line.setAttribute('y1', '12');
          line.setAttribute('x2', '19');
          line.setAttribute('y2', '12');
        }
      }
    }
    
    renderTodos();
  }

  // 窗口拖拽 - 使用Electron原生的 -webkit-app-region: drag
  // 拖拽已在CSS中通过 -webkit-app-region: drag 实现

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + N: 新建任务
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      todoInput.focus();
    }
  });

  // 检查到期提醒
  setInterval(checkDueDates, 60000); // 每分钟检查一次
}



// 设置相关变量
let currentSettings = {
  theme: 'default',
  opacity: 95,
  accentColor: '#5b6cf7'
};

// 加载设置
async function loadSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-settings');
    currentSettings = { ...currentSettings, ...settings };
    applySettings();
  } catch (error) {
    console.error('加载设置失败:', error);
  }
}

// 应用设置到界面
function applySettings() {
  // 应用主题，保留紧凑模式状态
  const currentCompactMode = document.body.classList.contains('compact-mode');
  document.body.className = currentSettings.theme === 'light' ? 'light-theme' : '';
  if (currentCompactMode) {
    document.body.classList.add('compact-mode');
  }

  // 应用强调色
  document.documentElement.style.setProperty('--accent-color', currentSettings.accentColor);

  // 设置data-color属性以便CSS变量规则生效
  document.documentElement.setAttribute('data-color', currentSettings.accentColor);

  // 计算RGB值
  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '91, 108, 247';
  };
  document.documentElement.style.setProperty('--accent-color-rgb', hexToRgb(currentSettings.accentColor));

  // 应用透明度 - 直接应用到整个窗口容器
  const container = document.querySelector('.container');
  if (container) {
    // 透明度设置：数值越大越不透明（30-100）
    const opacityValue = currentSettings.opacity / 100;
    container.style.opacity = opacityValue;
  }

  // 更新所有按钮的样式
  updateButtonStyles();
}

// 更新按钮样式
function updateButtonStyles() {
  const buttons = document.querySelectorAll('.btn-primary, .btn-icon, .priority-btn');
  buttons.forEach(btn => {
    btn.style.setProperty('--accent-color', currentSettings.accentColor, 'important');
  });
}

// 监听设置变化
ipcRenderer.on('settings-changed', (event, settings) => {
  currentSettings = settings;

  // 标准化透明度值：如果是小数（如 0.95），转换为整数（如 95）
  if (currentSettings.opacity < 10) {
    currentSettings.opacity = Math.round(currentSettings.opacity * 100);
  }

  // 先应用设置（保持紧凑模式状态）
  applySettings();

  // 然后渲染任务列表
  renderTodos();

  // 如果当前是紧凑模式，重新调整窗口大小
  if (isCompactMode) {
    // 使用 requestAnimationFrame 确保在 DOM 更新后执行
    requestAnimationFrame(() => {
      const itemCount = todos.length;
      const headerHeight = 40;
      const itemHeight = 32;
      const padding = 24;
      const minHeight = headerHeight + padding + Math.min(itemCount, 15) * itemHeight;
      const newHeight = Math.max(minHeight, 300);
      ipcRenderer.send('resize-window', 300, newHeight);
    });
  }
});

// 启动应用
init();

// 加载设置
loadSettings();

// 格式化日期
function formatDate(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly.getTime() === today.getTime()) {
    return '今天 ' + formatTime(date);
  } else if (dateOnly.getTime() === tomorrow.getTime()) {
    return '明天 ' + formatTime(date);
  } else {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${formatTime(date)}`;
  }
}

// 格式化时间
function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// 创建子任务容器
function createSubtasksContainer(todo) {
  const container = document.createElement('div');
  container.className = 'subtasks-container';

  const header = document.createElement('div');
  header.className = 'subtasks-header';

  const title = document.createElement('span');
  title.className = 'subtasks-title';
  title.textContent = '子任务';

  const addBtn = document.createElement('button');
  addBtn.className = 'add-subtask-btn';
  addBtn.innerHTML = '+ 添加';
  addBtn.addEventListener('click', () => addSubtask(todo.id));

  header.appendChild(title);
  header.appendChild(addBtn);

  container.appendChild(header);

  todo.subtasks.forEach(subtask => {
    const subtaskItem = createSubtaskElement(todo.id, subtask);
    container.appendChild(subtaskItem);
  });

  return container;
}

// 创建子任务元素
function createSubtaskElement(parentId, subtask) {
  const item = document.createElement('div');
  item.className = `subtask-item ${subtask.completed ? 'completed' : ''}`;
  item.dataset.subtaskId = subtask.id;

  const checkbox = document.createElement('div');
  checkbox.className = `subtask-checkbox ${subtask.completed ? 'checked' : ''}`;
  checkbox.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
  checkbox.addEventListener('click', () => toggleSubtask(parentId, subtask.id));

  const text = document.createElement('div');
  text.className = 'subtask-text';
  text.textContent = subtask.text;

  const actions = document.createElement('div');
  actions.className = 'subtask-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'subtask-action-btn edit';
  editBtn.title = '编辑';
  editBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `;
  editBtn.addEventListener('click', () => editSubtask(parentId, subtask.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'subtask-action-btn delete';
  deleteBtn.title = '删除';
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;
  deleteBtn.addEventListener('click', () => deleteSubtask(parentId, subtask.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  item.appendChild(checkbox);
  item.appendChild(text);
  item.appendChild(actions);

  return item;
}

// 添加子任务
function addSubtask(parentId) {
  const text = prompt('请输入子任务内容:');
  if (!text || !text.trim()) return;

  const todo = todos.find(t => t.id === parentId);
  if (!todo) return;

  if (!todo.subtasks) {
    todo.subtasks = [];
  }

  todo.subtasks.push({
    id: Date.now(),
    text: text.trim(),
    completed: false,
    createdAt: new Date().toISOString()
  });

  saveTodos();
  renderTodos();
}

// 切换子任务完成状态
function toggleSubtask(parentId, subtaskId) {
  const todo = todos.find(t => t.id === parentId);
  if (!todo || !todo.subtasks) return;

  const subtask = todo.subtasks.find(s => s.id === subtaskId);
  if (subtask) {
    subtask.completed = !subtask.completed;
    saveTodos();
    renderTodos();
  }
}

// 编辑子任务
function editSubtask(parentId, subtaskId) {
  const todo = todos.find(t => t.id === parentId);
  if (!todo || !todo.subtasks) return;

  const subtask = todo.subtasks.find(s => s.id === subtaskId);
  if (!subtask) return;

  const newText = prompt('编辑子任务:', subtask.text);
  if (newText && newText.trim()) {
    subtask.text = newText.trim();
    saveTodos();
    renderTodos();
  }
}

// 删除子任务
function deleteSubtask(parentId, subtaskId) {
  if (!confirm('确定要删除这个子任务吗？')) return;

  const todo = todos.find(t => t.id === parentId);
  if (!todo || !todo.subtasks) return;

  todo.subtasks = todo.subtasks.filter(s => s.id !== subtaskId);
  saveTodos();
  renderTodos();
}

// 检查到期提醒
function checkDueDates() {
  const now = new Date();
  todos.forEach(todo => {
    if (todo.dueDate && !todo.completed) {
      const dueDate = new Date(todo.dueDate);
      const timeDiff = dueDate - now;

      // 到期前1小时提醒
      if (timeDiff > 0 && timeDiff < 3600000 && !todo.notified) {
        showNotification(`任务即将到期: ${todo.text}`, 'warning');
        todo.notified = true;
        saveTodos();
      }

      // 已过期提醒
      if (timeDiff < 0 && Math.abs(timeDiff) < 3600000 && !todo.overdueNotified) {
        showNotification(`任务已过期: ${todo.text}`, 'critical');
        todo.overdueNotified = true;
        saveTodos();
      }
    }
  });
}

// 显示通知
function showNotification(message, type = 'default') {
  if ('Notification' in window) {
    // 图标路径配置 - 使用不同的图标文件
    const iconConfig = {
      default: './static/img/icon.ico',
      warning: './static/img/warning.ico',  // 警告图标
      critical: './static/img/critical.ico'  // 严重警告图标
    };
    
    const iconPath = iconConfig[type] || iconConfig.default;
    
    try {
      const notification = new Notification('Todooooo - 待办事项', {
        body: message,
        icon: iconPath
      });
      
      notification.onclick = function() {
        window.focus();
      };
    } catch (error) {
      console.error('显示通知失败:', error);
      // 如果图标路径有问题，尝试不使用图标
      try {
        const notification = new Notification('Todooooo - 待办事项', {
          body: message
        });
        notification.onclick = function() {
          window.focus();
        };
      } catch (fallbackError) {
        console.error('无图标通知也失败:', fallbackError);
      }
    }
  }
}

// 请求通知权限
if ('Notification' in window && Notification.permission === 'default') {
  Notification.requestPermission();
}

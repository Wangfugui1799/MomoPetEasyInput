export const THEME_KEY = 'momo.ui.theme.v1';
export const normalizeTheme = value => value === 'moonlight' ? 'moonlight' : 'classic';

// Presentation only: move live DOM nodes, never recreate app/audio/device state.
export function initUITheme({onChatVisible, notify = () => {}}) {
  const $ = selector => document.querySelector(selector);
  const root = document.documentElement;
  const chatDialog = $('#chat-dialog');
  const content = document.createElement('div');
  content.id = 'chat-content';
  content.append(...chatDialog.childNodes);
  chatDialog.append(content);

  const left = document.createElement('div');
  left.className = 'moon-left moon-only';
  const chat = document.createElement('section');
  chat.id = 'moon-chat';
  chat.className = 'moon-chat moon-only';
  chat.setAttribute('aria-label', '和 Momo 聊聊');
  $('.playground').append(left, chat);

  const moved = new Map();
  function move(node, destination) {
    if (!moved.has(node)) {
      const anchor = document.createComment('classic position');
      node.before(anchor);
      moved.set(node, anchor);
    }
    destination.append(node);
  }
  function restore(node) { moved.get(node)?.after(node); }

  const pet = document.createElement('img');
  pet.className = 'moon-pet moon-pet-awake moon-only';
  pet.src = './assets/momo-moonlight.png';
  pet.alt = 'Momo：薄荷绿的小魅魔，紫色弯角、小蝠翼和心形尾尖，托腮含笑';
  pet.draggable = false;
  const asleep = pet.cloneNode();
  asleep.src = './assets/momo-moonlight-sleep.png';
  asleep.className = 'moon-pet moon-pet-asleep moon-only';
  asleep.alt = 'Momo 闭着眼睛，安静地睡着了';
  $('#pet-wrap').prepend(pet, asleep);

  const switcher = document.createElement('div');
  switcher.className = 'theme-switch';
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', '界面风格');
  switcher.innerHTML = '<button type="button" data-theme-choice="classic" aria-pressed="true">经典</button><button type="button" data-theme-choice="moonlight" aria-pressed="false"><span class="theme-moon" aria-hidden="true"></span>月光小窝</button>';
  $('.topbar nav').before(switcher);

  const moonTitle = document.createElement('h1');
  moonTitle.className = 'moon-only moon-greeting';
  moonTitle.textContent = '你来了，靠近一点。';
  $('.greeting').prepend(moonTitle);

  const keyIcons = ['cookie', 'hand-heart', 'target', 'compass', 'chat-circle', 'crown', 'music-notes', 'moon'];
  document.querySelectorAll('.key').forEach((key, i) => {
    key.style.setProperty('--activity-icon', `url('./assets/icons/${keyIcons[i]}.svg')`);
    const number = document.createElement('span');
    number.className = 'moon-key-number moon-only';
    number.textContent = `S${i + 1}`;
    key.append(number);
  });
  for (const [selector, icon] of [['#settings-open','gear'],['#diary-open','book-open'],['#bluetooth-connect','bluetooth']]) {
    const el = $(selector);
    el.style.setProperty('--tool-icon', `url('./assets/icons/${icon}.svg')`);
  }

  // Group existing settings, including dynamically inserted voice/wireless panels.
  const settings = $('#settings-dialog');
  const groups = document.createElement('div');
  groups.className = 'moon-settings moon-only';
  const settingsNav = document.createElement('nav');
  settingsNav.className = 'settings-nav';
  settingsNav.setAttribute('aria-label', '设置分类');
  groups.append(settingsNav);
  const groupNodes = [];
  function addGroup(id, title, nodes) {
    const section = document.createElement('section');
    section.id = `settings-${id}`;
    section.className = 'settings-group';
    section.setAttribute('aria-label', title);
    const h = document.createElement('h3');
    h.className = 'settings-group-title';
    h.textContent = title;
    section.append(h);
    groups.append(section);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = title;
    button.onclick = () => section.scrollIntoView({block:'start',behavior:'instant'});
    settingsNav.append(button);
    groupNodes.push({section, nodes: nodes.filter(Boolean)});
  }
  const row = id => $(id).closest('.setting-row');
  addGroup('appearance', '外观', [row('#always-top')]);
  addGroup('devices', '设备连接', [$('.wireless-settings'), row('#reverse-knob')]);
  addGroup('audio', '声音与麦克风', [row('#volume'), $('#voice-input').closest('section'), $('#voice-cue').closest('section'), $('#input-sound-enabled').closest('section')]);
  addGroup('ai', 'AI 对话', [$('#ai-form').previousElementSibling.previousElementSibling, $('#ai-form').previousElementSibling, $('#ai-form')]);
  addGroup('data', '数据管理', [$('#clear-data'), $('#clear-data').nextElementSibling]);
  settings.append(groups);

  const brandSubtitle = $('.brand small');
  const originalSubtitle = brandSubtitle.textContent;
  const chatHeading = content.querySelector('h2');
  const originalChatHeading = chatHeading.textContent;
  let theme = 'classic';
  let focusBeforeSwitch;
  switcher.addEventListener('pointerdown', () => { focusBeforeSwitch = document.activeElement; });

  function setTheme(value, {persist = true} = {}) {
    const next = normalizeTheme(value);
    const focused = focusBeforeSwitch || document.activeElement;
    focusBeforeSwitch = null;
    const inputFocused = focused === $('#chat-input');
    const scroll = $('#messages').scrollTop;
    if (next !== theme) {
      if (next === 'moonlight') {
        chatDialog.close();
        for (const node of [$('.pet-room'), $('.vitals'), $('.control-panel')]) move(node, left);
        move(content, chat);
        for (const {section, nodes} of groupNodes) for (const node of nodes) move(node, section);
      } else {
        for (const node of moved.keys()) restore(node);
      }
    }
    theme = next;
    root.dataset.theme = theme;
    brandSubtitle.textContent = theme === 'moonlight' ? '月光小窝' : originalSubtitle;
    chatHeading.textContent = theme === 'moonlight' ? '和 Momo 聊聊' : originalChatHeading;
    for (const button of switcher.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    $('meta[name="theme-color"]').content = theme === 'moonlight' ? '#211f2a' : '#f7f8f3';
    if (theme === 'moonlight') onChatVisible();
    else if (inputFocused && !document.querySelector('dialog[open]')) chatDialog.showModal();
    $('#messages').scrollTop = scroll;
    if (inputFocused) $('#chat-input').focus({preventScroll:true});
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); }
      catch { notify('界面已切换，但本地存储不可用，下次打开将使用经典界面。'); }
    }
  }
  switcher.addEventListener('click', event => {
    const button = event.target.closest('[data-theme-choice]');
    if (button) setTheme(button.dataset.themeChoice);
  });
  let saved;
  try { saved = localStorage.getItem(THEME_KEY); } catch {}
  setTheme(saved, {persist:false});
  return {
    openChat() {
      if (theme === 'classic' && !chatDialog.open) chatDialog.showModal();
      if (theme === 'moonlight') chat.scrollIntoView({block:'nearest',behavior:'instant'});
    },
  };
}

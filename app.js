// 繁簡轉換：使用 opencc-js（以詞彙為單位轉換，避免 复仇→覆仇 這類錯誤）
// 大量文字（15 萬字以上）的效能重點：
//   - 只用一個文字框，按按鈕才轉換（不在每次輸入時轉換）
//   - 關閉拼字檢查（spellcheck="false"），否則瀏覽器檢查大段文字會卡住
//   - 字數統計延遲到停止輸入後才計算

const $ = (id) => document.getElementById(id);
const box = $('text');
const status = $('status');
const countEl = $('count');

const RULES_KEY = 'zh-converter-rules';
const THEME_KEY = 'zh-converter-theme';

// cn = 中國大陸簡體；tw = 台灣正體字形。
// 只轉字形，不轉用語（软件 → 軟件，不會變成 軟體），因為有些文章需要保留大陸用語。
// 想要轉成台灣用語，可改成 'twp'。
const s2t = OpenCC.Converter({ from: 'cn', to: 'tw' });
const t2s = OpenCC.Converter({ from: 'tw', to: 'cn' });

// ---- 深色 / 淺色模式 ----
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : darkQuery.matches;
}

function renderThemeButton() {
  $('theme').textContent = isDark() ? '☀ 淺色模式' : '🌙 深色模式';
}

$('theme').addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch {}
  renderThemeButton();
});
darkQuery.addEventListener('change', renderThemeButton);

// ---- 字數統計 ----
let countTimer;

function updateCount() {
  // 不計空白與換行
  countEl.textContent = box.value.replace(/\s/g, '').length.toLocaleString();
}

function scheduleCount() {
  clearTimeout(countTimer);
  countTimer = setTimeout(updateCount, 200);
}

box.addEventListener('input', scheduleCount);

// ---- 自訂修正詞典 ----
function loadRules() {
  try {
    return JSON.parse(localStorage.getItem(RULES_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRules(rules) {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {
    status.textContent = '無法儲存自訂詞典（瀏覽器封鎖了本機儲存）';
  }
}

let rules = loadRules();

function applyRules(text) {
  // 長的詞先替換，避免短詞先吃掉長詞的一部分
  const sorted = [...rules].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    text = text.split(from).join(to);
  }
  return text;
}

function renderRules() {
  const list = $('rules');
  list.innerHTML = '';
  // 新的在上面：rules 依新增順序存放，倒著顯示
  for (let i = rules.length - 1; i >= 0; i--) {
    const [from, to] = rules[i];
    const li = document.createElement('li');
    li.textContent = `${from} → ${to}`;
    const del = document.createElement('button');
    del.textContent = '刪除';
    del.onclick = () => {
      rules.splice(i, 1);
      saveRules(rules);
      renderRules();
    };
    li.appendChild(del);
    list.appendChild(li);
  }
  list.scrollTop = 0;
}

// 方向鍵切換兩個輸入框：游標在「錯誤」框的最後按 →，跳到「正確」框；
// 游標在「正確」框的最前面按 ←，跳回「錯誤」框。
function jumpTo(target) {
  target.focus();
  const end = target.value.length;
  target.setSelectionRange(end, end);
}

$('rule-from').addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.isComposing || e.key !== 'ArrowRight') return; // 注音 / 拼音選字中不攔截
  if (el.selectionStart === el.value.length && el.selectionEnd === el.value.length) {
    e.preventDefault();
    jumpTo($('rule-to'));
  }
});

$('rule-to').addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.isComposing || e.key !== 'ArrowLeft') return;
  if (el.selectionStart === 0 && el.selectionEnd === 0) {
    e.preventDefault();
    jumpTo($('rule-from'));
  }
});

$('add-rule').addEventListener('submit', (e) => {
  e.preventDefault();
  const from = $('rule-from').value.trim();
  const to = $('rule-to').value.trim();
  if (!from || !to) return;
  rules = rules.filter(([f]) => f !== from);
  rules.push([from, to]);
  saveRules(rules);
  renderRules();
  $('rule-from').value = '';
  $('rule-to').value = '';
});

// ---- 轉換 ----
let previous = null; // 給「復原」用：轉換前的文字

function setText(text) {
  box.value = text;
  updateCount();
}

function convert(fn, label) {
  const text = box.value;
  if (!text) return;
  const t0 = performance.now();
  const result = fn(text);
  if (result !== text) {
    previous = text;
    $('undo').disabled = false;
    setText(result);
  }
  const ms = Math.round(performance.now() - t0);
  status.textContent = `已${label}（${ms} ms）`;
}

$('to-trad').addEventListener('click', () => convert((t) => applyRules(s2t(t)), '轉換為繁體'));
$('to-simp').addEventListener('click', () => convert(t2s, '轉換為簡體'));

$('undo').addEventListener('click', () => {
  if (previous === null) return;
  setText(previous);
  previous = null;
  $('undo').disabled = true;
  status.textContent = '已復原';
});

$('clear').addEventListener('click', () => {
  if (box.value) {
    previous = box.value; // 清除也可以復原，避免誤按
    $('undo').disabled = false;
  }
  setText('');
  status.textContent = '';
  box.focus();
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(box.value);
  } catch {
    box.select();
    document.execCommand('copy');
  }
  status.textContent = '已複製到剪貼簿';
});

renderThemeButton();
renderRules();
updateCount();

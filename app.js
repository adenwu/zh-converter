// 繁簡轉換：使用 opencc-js（以詞彙為單位轉換，避免 复仇→覆仇 這類錯誤）

const $ = (id) => document.getElementById(id);
const input = $('input');
const output = $('output');
const status = $('status');

const STORAGE_KEY = 'zh-converter-rules';

// cn = 中國大陸簡體；twp = 台灣正體 + 台灣慣用詞（軟體、網路…）
const s2t = OpenCC.Converter({ from: 'cn', to: 'twp' });
const t2s = OpenCC.Converter({ from: 'twp', to: 'cn' });

// ---- 自訂修正詞典 ----
function loadRules() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRules(rules) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
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
  rules.forEach(([from, to], i) => {
    const li = document.createElement('li');
    li.textContent = `${from} → ${to}`;
    const del = document.createElement('button');
    del.textContent = '刪除';
    del.onclick = () => {
      rules.splice(i, 1);
      saveRules(rules);
      renderRules();
      convert();
    };
    li.appendChild(del);
    list.appendChild(li);
  });
}

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
  convert();
});

// ---- 轉換 ----
function direction() {
  return document.querySelector('input[name="dir"]:checked').value;
}

function convert() {
  const text = input.value;
  output.value = direction() === 's2t' ? applyRules(s2t(text)) : t2s(text);
  status.textContent = text ? `共 ${text.length} 字` : '';
}

$('convert').addEventListener('click', convert);
input.addEventListener('input', () => {
  if ($('live').checked) convert();
});
document.querySelectorAll('input[name="dir"]').forEach((r) =>
  r.addEventListener('change', convert)
);

$('clear').addEventListener('click', () => {
  input.value = '';
  output.value = '';
  status.textContent = '';
  input.focus();
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(output.value);
  } catch {
    output.select();
    document.execCommand('copy');
  }
  status.textContent = '已複製到剪貼簿';
});

renderRules();

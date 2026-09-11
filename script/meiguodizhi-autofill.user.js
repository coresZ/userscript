// ==UserScript==
// @name         美国地址生成器 · 通用一键填充 (meiguodizhi)
// @name:en      US Address Generator · Universal Autofill
// @namespace    https://github.com/yourname/meiguodizhi-autofill
// @version      1.2.0
// @description  以 meiguodizhi.com 为数据源，在任意网站一键拉取并填充虚拟身份/地址数据，支持收藏管理与使用记录。数据为该站声明的“仅供学习地址格式”的虚构测试数据。
// @author       you
// @match        *://*/*
// @icon         https://www.meiguodizhi.com/favicon.ico
// @connect      meiguodizhi.com
// @connect      www.meiguodizhi.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @noframes
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  /* =========================================================================
   * 0. 常量 / 配置
   * =======================================================================*/
  const API = 'https://www.meiguodizhi.com/api/v1/dz';
  const STORE = {
    CURRENT: 'mgdz_current',     // 当前身份
    FAVS: 'mgdz_favorites',      // 收藏夹 []
    LOGS: 'mgdz_usage_logs',     // 使用记录 []
    SETTINGS: 'mgdz_settings',   // 设置
    MAPS: 'mgdz_field_maps',     // 按站点手动映射 { host: { signature: fieldKey } }
    REGION: 'mgdz_region',       // 上次选择的地区
    POS: 'mgdz_ball_pos',        // 悬浮球位置
  };

  const DEFAULT_SETTINGS = {
    maskSensitive: true,         // 敏感字段遮罩
    mode: 'all',                 // all | whitelist | blacklist
    whitelist: [],
    blacklist: [],
    autoRecord: true,            // 填充时自动记录网址
  };

  /* ---- 地区（映射到接口 path） ---- */
  const COUNTRIES = [
    { label: '美国', path: '/', country: 'United States', aliases: ['united states', 'usa', 'us', 'america', '美国'] },
    { label: '加拿大', path: '/ca-address', country: 'Canada', aliases: ['canada', '加拿大'] },
    { label: '澳大利亚', path: '/au-address', country: 'Australia', aliases: ['australia', '澳大利亚'] },
    { label: '英国', path: '/uk-address', country: 'United Kingdom', aliases: ['united kingdom', 'uk', 'britain', 'england', '英国'] },
    { label: '日本', path: '/jp-address', country: 'Japan', aliases: ['japan', '日本'] },
    { label: '韩国', path: '/kr-address', country: 'South Korea', aliases: ['korea', '韩国'] },
    { label: '德国', path: '/de-address', country: 'Germany', aliases: ['germany', '德国'] },
    { label: '法国', path: '/fr-address', country: 'France', aliases: ['france', '法国'] },
    { label: '意大利', path: '/it-address', country: 'Italy', aliases: ['italy', '意大利'] },
    { label: '西班牙', path: '/es-address', country: 'Spain', aliases: ['spain', '西班牙'] },
    { label: '荷兰', path: '/nl-address', country: 'Netherlands', aliases: ['netherlands', '荷兰'] },
    { label: '新加坡', path: '/sg-address', country: 'Singapore', aliases: ['singapore', '新加坡'] },
    { label: '马来西亚', path: '/my-address', country: 'Malaysia', aliases: ['malaysia', '马来西亚'] },
    { label: '俄罗斯', path: '/ru-address', country: 'Russia', aliases: ['russia', '俄罗斯'] },
    { label: '中国', path: '/cn-address', country: 'China', aliases: ['china', '中国'] },
    { label: '台湾', path: '/tw-address', country: 'Taiwan', aliases: ['taiwan', '台湾'] },
    { label: '香港', path: '/hk-address', country: 'Hong Kong', aliases: ['hong kong', '香港'] },
    { label: '泰国', path: '/th-address', country: 'Thailand', aliases: ['thailand', '泰国'] },
    { label: '菲律宾', path: '/ph-address', country: 'Philippines', aliases: ['philippines', '菲律宾'] },
    { label: '越南', path: '/vn-address', country: 'Vietnam', aliases: ['vietnam', '越南'] },
    { label: '阿根廷', path: '/ar-address', country: 'Argentina', aliases: ['argentina', '阿根廷'] },
    { label: '土耳其', path: '/tr-address', country: 'Turkey', aliases: ['turkey', '土耳其'] },
  ];

  const US_STATES = [
    ['阿拉巴马', 'alabama'], ['阿拉斯加', 'alaska'], ['亚利桑那', 'arizona'], ['阿肯色', 'arkansas'],
    ['加利福尼亚', 'california'], ['科罗拉多', 'colorado'], ['康涅狄格', 'connecticut'], ['特拉华', 'delaware'],
    ['佛罗里达', 'florida'], ['佐治亚', 'georgia'], ['夏威夷', 'hawaii'], ['爱达荷', 'idaho'],
    ['伊利诺伊', 'illinois'], ['印第安纳', 'indiana'], ['艾奥瓦', 'iowa'], ['堪萨斯', 'kansas'],
    ['肯塔基', 'kentucky'], ['路易斯安那', 'lousiana'], ['缅因', 'maine'], ['马里兰', 'maryland'],
    ['麻萨诸塞', 'massachusetts'], ['密歇根', 'michigan'], ['明尼苏达', 'minnesota'], ['密西西比', 'mississippi'],
    ['密苏里', 'missouri'], ['蒙大拿', 'montana'], ['内布拉斯加', 'nebraska'], ['内华达', 'nevada'],
    ['新罕布什尔', 'new-hampshire'], ['新泽西', 'new-jersey'], ['新墨西哥', 'new-mexico'], ['纽约', 'new-york'],
    ['北卡罗来纳', 'north-carolina'], ['北达科他', 'north-dakota'], ['俄亥俄', 'ohio'], ['俄克拉何马', 'oklahoma'],
    ['俄勒冈', 'oregon'], ['宾夕法尼亚', 'pennsylvania'], ['罗得岛', 'rhode-island'], ['南卡罗来纳', 'south-carolina'],
    ['南达科他', 'south-dakota'], ['田纳西', 'tennessee'], ['得克萨斯', 'texas'], ['犹他', 'utah'],
    ['佛蒙特', 'vermont'], ['弗吉尼亚', 'virginia'], ['华盛顿', 'washington'], ['西弗吉尼亚', 'west-virginia'],
    ['威斯康星', 'wisconsin'], ['怀俄明', 'wyoming'],
  ];

  const US_CITIES = [
    ['纽约', 'New-York'], ['洛杉矶', 'Los-Angeles'], ['芝加哥', 'Chicago'], ['休斯敦', 'Houston'],
    ['菲尼克斯', 'Phoenix'], ['费城', 'Philadelphia'], ['圣安东尼奥', 'San-Antonio'], ['圣地亚哥', 'San-Diego'],
    ['达拉斯', 'Dallas'], ['圣何塞', 'San-Jose'], ['奥斯汀', 'Austin'], ['旧金山', 'San-Francisco'],
    ['西雅图', 'Seattle'], ['丹佛', 'Denver'], ['华盛顿', 'Washington'], ['波士顿', 'Boston'],
    ['拉斯维加斯', 'Las-Vegas'], ['迈阿密', 'Miami'], ['亚特兰大', 'Atlanta'], ['底特律', 'Detroit'],
  ];

  /* ---- 字段展示分组 ---- */
  const GROUPS = [
    { title: '基本资料', keys: ['Full_Name', 'Gender', 'Birthday', 'Title', 'Hair_Color', 'Full_Name_Tran'] },
    { title: '地址', keys: ['Address', 'City', 'State', 'State_Full', 'Zip_Code', 'Telephone', 'Temporary_mail'] },
    { title: '就业 & 信用卡', keys: ['Credit_Card_Type', 'Credit_Card_Number', 'CVV2', 'Expires', 'Occupation', 'Company_Name', 'Company_Size', 'Employment_Status', 'Monthly_Salary', 'Social_Security_Number'] },
    { title: '更多资料', keys: ['Username', 'Password', 'Height', 'Weight', 'Blood_Type', 'System', 'GUID', 'Browser_User_Agent', 'Educational_Background', 'Website', 'Security_Question', 'Security_Answer'] },
  ];

  const LABELS = {
    Full_Name: '全名', Full_Name_Tran: '译名', Gender: '性别', Birthday: '生日', Title: '称谓', Hair_Color: '发色',
    Address: '街道地址', City: '城市', State: '州', State_Full: '州全称', Zip_Code: '邮编', Telephone: '电话', Temporary_mail: '临时邮箱',
    Credit_Card_Type: '卡类型', Credit_Card_Number: '信用卡号', CVV2: 'CVV2', Expires: '过期时间',
    Occupation: '职业', Company_Name: '公司', Company_Size: '公司规模', Employment_Status: '就业状态', Monthly_Salary: '月薪', Social_Security_Number: 'SSN',
    Username: '用户名', Password: '密码', Height: '身高', Weight: '体重', Blood_Type: '血型', System: '操作系统',
    GUID: 'GUID', Browser_User_Agent: 'UA', Educational_Background: '教育', Website: '个人主页', Security_Question: '安全问题', Security_Answer: '问题答案',
  };

  const SENSITIVE = new Set(['Credit_Card_Number', 'CVV2', 'Social_Security_Number', 'Password']);

  /* =========================================================================
   * 1. 存储辅助
   * =======================================================================*/
  const gv = (k, d) => { try { return GM_getValue(k, d); } catch (e) { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } };
  const sv = (k, v) => { try { GM_setValue(k, v); } catch (e) { localStorage.setItem(k, JSON.stringify(v)); } };
  const getSettings = () => Object.assign({}, DEFAULT_SETTINGS, gv(STORE.SETTINGS, {}));
  function nextSeq() { const n = (gv('_seq', 0) || 0) + 1; sv('_seq', n); return n; }

  /* ---- 站点作用域：黑名单始终优先，白名单模式再收窄 ---- */
  function hostMatch(host, pat) {
    pat = String(pat || '').trim().toLowerCase(); host = String(host || '').toLowerCase();
    if (!pat) return false;
    if (pat.charAt(0) === '*' && pat.charAt(1) === '.') { const b = pat.slice(2); return host === b || host.endsWith('.' + b); }
    return host === pat || host.endsWith('.' + pat);
  }
  function siteEnabled(host) {
    const s = getSettings();
    const inList = arr => (arr || []).some(p => hostMatch(host, p));
    if (inList(s.blacklist)) return false;
    if (s.mode === 'whitelist') return inList(s.whitelist);
    return true;
  }
  function setSiteEnabled(host, enabled) {
    const s = getSettings();
    const rm = arr => (arr || []).filter(p => p !== host);
    if (enabled) {
      s.blacklist = rm(s.blacklist);
      if (s.mode === 'whitelist' && !(s.whitelist || []).includes(host)) s.whitelist = (s.whitelist || []).concat(host);
    } else {
      if (!(s.blacklist || []).includes(host)) s.blacklist = (s.blacklist || []).concat(host);
      s.whitelist = rm(s.whitelist);
    }
    sv(STORE.SETTINGS, s);
  }

  /* =========================================================================
   * 2. 数据源：跨域拉取
   * =======================================================================*/
  function fetchAddress(path) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: API,
        headers: { 'Content-Type': 'application/json' },
        data: JSON.stringify({ city: '', path: path || '/', method: 'refresh' }),
        timeout: 15000,
        onload: (r) => {
          try {
            const j = JSON.parse(r.responseText);
            if (j && j.status === 'ok' && j.address) resolve(j.address);
            else reject(new Error(j && j.status ? j.status : '返回异常'));
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error('网络错误')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  /* =========================================================================
   * 3. 字段 → 表单 语义匹配定义
   * =======================================================================*/
  function firstName(d) { const p = String(d.Full_Name || '').trim().split(/\s+/); return p[0] || ''; }
  function lastName(d) { const p = String(d.Full_Name || '').trim().split(/\s+/); return p.length > 1 ? p.slice(1).join(' ') : (p[0] || ''); }

  // 顺序即优先级（先匹配到者胜出）
  const SEMANTIC = [
    { key: 'email', get: d => d.Temporary_mail, type: 'email', ac: ['email'], inc: /e-?mail|邮箱|电子邮件/i },
    { key: 'firstName', get: firstName, ac: ['given-name'], inc: /first[\s_-]*name|given[\s_-]*name|forename|名字/i },
    { key: 'lastName', get: lastName, ac: ['family-name'], inc: /last[\s_-]*name|sur[\s_-]*name|family[\s_-]*name|姓氏/i },
    { key: 'fullName', get: d => d.Full_Name, ac: ['name'], inc: /full[\s_-]*name|your[\s_-]*name|recipient|contact[\s_-]*name|收货人|收件人|姓名|全名/i, exc: /user|first|last|company|nick|display|screen|card/i },
    { key: 'gender', get: d => d.Gender, ac: ['sex'], inc: /gender|\bsex\b|性别/i },
    { key: 'title', get: d => d.Title, ac: ['honorific-prefix'], inc: /salutation|honorific|\btitle\b|name[\s_-]*prefix|称谓|尊称|头衔/i, exc: /job|position|post|work|工作|职位|职务|book|song|movie|课程|文章|标题/i },
    { key: 'phone', get: d => d.Telephone, type: 'tel', ac: ['tel', 'tel-national', 'tel-local'], inc: /phone|mobile|^tel$|telephone|contact[\s_-]*(number|no)|电话|手机|联系方式/i },
    { key: 'zip', get: d => d.Zip_Code, ac: ['postal-code'], inc: /zip|postal|post[\s_-]*code|邮编|邮政编码/i },
    { key: 'country', get: (d, region) => region.country, ac: ['country', 'country-name'], inc: /country|国家|国别/i },
    { key: 'state', get: d => d.State_Full || d.State, ac: ['address-level1'], inc: /state|province|region|州|省份|省/i, exc: /united|country|zip|postal|street/i },
    { key: 'city', get: d => d.City, ac: ['address-level2'], inc: /city|town|suburb|城市|市\/县|区县|城镇|所在市/i },
    { key: 'address', get: d => d.Address, ac: ['street-address', 'address-line1', 'address-line2', 'address'], inc: /address|street|地址|街道|详细地址|门牌/i, exc: /e-?mail|\bip\b|city|state|country|province|zip|postal|邮箱|城市|省|邮编/i },
    { key: 'company', get: d => d.Company_Name, ac: ['organization'], inc: /company|organi[sz]ation|employer|公司|单位|企业名称/i },
    { key: 'ccName', get: d => d.Full_Name, ac: ['cc-name'], inc: /card[\s_-]*holder|name[\s_-]*on[\s_-]*card|持卡人|卡上姓名/i },
    { key: 'ccNumber', get: d => d.Credit_Card_Number, ac: ['cc-number'], inc: /card[\s_-]*number|cc[\s_-]*num|credit[\s_-]*card|卡号|信用卡号/i },
    { key: 'cvv', get: d => d.CVV2, ac: ['cc-csc'], inc: /cvv|cvc|csc|security[\s_-]*code|安全码|卡背/i },
    { key: 'ccExp', get: d => d.Expires, ac: ['cc-exp'], inc: /expir|exp[\s_-]*date|有效期|过期时间/i },
    { key: 'ssn', get: d => d.Social_Security_Number, ac: ['off'], inc: /\bssn\b|social[\s_-]*security|社会保障号/i },
    { key: 'username', get: d => d.Username, ac: ['username'], inc: /user[\s_-]*name|login|account|用户名|账号|帐号/i, exc: /first|last|full|nick|display|company|real/i },
    { key: 'password', get: d => d.Password, type: 'password', ac: ['new-password', 'current-password'], inc: /pass[\s_-]*word|passwd|密码|口令/i },
  ];

  function labelTextFor(el) {
    let t = '';
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) t += ' ' + l.textContent; }
    const wrap = el.closest('label'); if (wrap) t += ' ' + wrap.textContent;
    // 前一个兄弟节点常作标签
    let prev = el.previousElementSibling, hop = 0;
    while (prev && hop < 2) { if (/^(label|span|div|td|th|p)$/i.test(prev.tagName)) t += ' ' + prev.textContent; prev = prev.previousElementSibling; hop++; }
    return t.replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  function signatureOf(el) {
    return (el.getAttribute('name') || el.id || el.getAttribute('placeholder') || el.getAttribute('aria-label') || '').trim();
  }

  function scoreField(el, region) {
    if (el.disabled || el.readOnly) return null;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (tag === 'input' && /hidden|submit|button|reset|file|image|range|color/.test(type)) return null;

    const ac = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
    const nameId = ((el.getAttribute('name') || '') + ' ' + (el.id || '')).toLowerCase();
    const ph = (el.getAttribute('placeholder') || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const label = labelTextFor(el).toLowerCase();

    // 强类型信号
    const typeHint = { email: 'email', tel: 'phone', password: 'password' }[type];

    let best = null;
    for (const f of SEMANTIC) {
      let score = 0;
      if (f.ac && ac && f.ac.includes(ac)) score = 100;
      else {
        if (f.exc && (f.exc.test(nameId) || f.exc.test(label) || f.exc.test(ph))) continue;
        if (typeHint && typeHint === f.key) score = 92;
        else if (f.inc.test(nameId)) score = 70;
        else if (f.inc.test(aria)) score = 62;
        else if (f.inc.test(label)) score = 58;
        else if (f.inc.test(ph)) score = 46;
      }
      if (score > 0 && (!best || score > best.score)) best = { field: f, score };
      if (best && best.score >= 100) break;
    }
    return best;
  }

  /* =========================================================================
   * 4. 填充引擎
   * =======================================================================*/
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
    try { setter ? setter.call(el, value) : (el.value = value); } catch (e) { el.value = value; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // contenteditable（富文本）字段
  function setEditable(el, value) {
    try { el.focus(); } catch (e) {}
    try { el.textContent = value; } catch (e) {}
    try { el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value })); }
    catch (e) { el.dispatchEvent(new Event('input', { bubbles: true })); }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function isEditable(el) {
    return !!(el && el.isContentEditable && el.getAttribute && el.getAttribute('contenteditable') != null);
  }

  function fillSelect(el, value, aliases) {
    const want = [value].concat(aliases || []).filter(Boolean).map(s => String(s).toLowerCase());
    for (const opt of el.options) {
      const t = (opt.textContent || '').toLowerCase().trim();
      const v = (opt.value || '').toLowerCase().trim();
      if (want.some(w => t === w || v === w || t.includes(w) || v.includes(w))) {
        el.value = opt.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  // radio / checkbox：仅当该项自身的值或标签与目标匹配时才勾选
  function fillCheckable(el, value, aliases) {
    const want = [value].concat(aliases || []).filter(Boolean).map(s => String(s).toLowerCase().trim());
    const ownVal = (el.value || '').toLowerCase().trim();
    const hay = (ownVal + ' ' + labelTextFor(el)).toLowerCase();
    const tokens = new Set(hay.split(/[^a-z0-9一-龥]+/i).filter(Boolean));
    // 仅整词/精确匹配：不做子串，避免 "male" 命中 "female"、"m" 命中 "female" 等
    const hit = want.some(w => w && (ownVal === w || tokens.has(w)));
    if (!hit) return false;
    el.checked = true;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return true;
  }
  const CHECKABLE_KEYS = new Set(['gender', 'title']);
  function genderAliases(g) {
    g = String(g || '').toLowerCase();
    if (g.charAt(0) === 'm' || g.indexOf('男') >= 0) return ['male', 'm', 'man', '男', '先生'];
    if (g.charAt(0) === 'f' || g.indexOf('女') >= 0) return ['female', 'f', 'woman', '女', '女士'];
    return [];
  }
  function aliasesFor(field, data, region) {
    if (field.key === 'country') return region.aliases || [];
    if (field.key === 'state') return [data.State, data.State_Full];
    if (field.key === 'gender') return genderAliases(data.Gender);
    return [];
  }

  // 收集可填充字段：穿透开放 Shadow DOM 与同源 iframe（跳过脚本自身面板）
  function collectFields(rootNode, acc, depth) {
    acc = acc || []; depth = depth || 0;
    if (!rootNode || depth > 8) return acc;
    let all;
    try { all = rootNode.querySelectorAll('*'); } catch (e) { return acc; }
    for (const elm of all) {
      if (elm.id === 'mgdz-root') continue;                 // 不递归脚本自身 UI
      const tag = elm.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') acc.push(elm);
      else if (isEditable(elm)) acc.push(elm);
      if (elm.shadowRoot) collectFields(elm.shadowRoot, acc, depth + 1);
      else if (tag === 'IFRAME' || tag === 'FRAME') {
        try { const doc = elm.contentDocument; if (doc) collectFields(doc, acc, depth + 1); } catch (e) { /* 跨域，跳过 */ }
      }
    }
    return acc;
  }

  function fillPage(data, region) {
    const maps = gv(STORE.MAPS, {});
    const hostMap = maps[location.host] || {};
    const inputs = collectFields(document);
    let filled = 0;
    const usedFields = new Set();

    for (const el of inputs) {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const checkable = (type === 'radio' || type === 'checkbox');
      if (!checkable && !isVisible(el)) continue;           // 单选/复选常被 CSS 隐藏但仍有效

      const sig = signatureOf(el);
      let fieldKey = hostMap[sig];      // 优先使用手动记忆映射
      let field = fieldKey ? SEMANTIC.find(f => f.key === fieldKey) : null;

      if (!field) {
        const s = scoreField(el, region);
        if (!s || s.score < 45) continue;
        field = s.field;
      }
      const value = field.get(data, region);
      if (value == null || value === '') continue;

      if (tag === 'select') {
        if (fillSelect(el, value, aliasesFor(field, data, region))) { filled++; usedFields.add(field.key); }
      } else if (checkable) {
        if (!CHECKABLE_KEYS.has(field.key)) continue;
        if (fillCheckable(el, value, aliasesFor(field, data, region))) { filled++; usedFields.add(field.key); }
      } else if (isEditable(el)) {
        setEditable(el, value); highlight(el); filled++; usedFields.add(field.key);
      } else {
        setNativeValue(el, value); highlight(el); filled++; usedFields.add(field.key);
      }
    }

    if (filled && getSettings().autoRecord) recordUsage(data, region, filled);
    toast(filled ? `已填充 ${filled} 个字段` : '未识别到可填充的表单字段，可试试「手动点选」', filled ? 'ok' : 'warn');
    return filled;
  }

  function isVisible(el) {
    try {
      const win = (el.ownerDocument && el.ownerDocument.defaultView) || window;
      if (!el.offsetParent && el.type !== 'hidden') { const r = el.getClientRects(); if (!r.length) return false; }
      const st = win.getComputedStyle(el);
      return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
    } catch (e) { return false; }
  }

  /* =========================================================================
   * 5. 使用记录
   * =======================================================================*/
  function recordUsage(data, region, count) {
    const logs = gv(STORE.LOGS, []);
    logs.unshift({
      id: 'log-' + nextSeq(),
      host: location.host,
      url: location.href,
      title: document.title.slice(0, 80),
      time: nowStr(),
      region: region.label,
      count: count,
      summary: `${data.Full_Name} · ${data.City}, ${data.State} ${data.Zip_Code}`,
      name: data.Full_Name,
    });
    sv(STORE.LOGS, logs.slice(0, 500));
  }
  function nowStr() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* =========================================================================
   * 6. 收藏
   * =======================================================================*/
  function addFavorite(data, region, note) {
    const favs = gv(STORE.FAVS, []);
    favs.unshift({
      id: 'fav-' + nextSeq(),
      time: nowStr(),
      region: region.label,
      path: region.path,
      note: note || '',
      data: data,
    });
    sv(STORE.FAVS, favs);
    toast('已收藏', 'ok');
  }

  /* =========================================================================
   * 7. UI（Shadow DOM）
   * =======================================================================*/
  let root, panel, state = {
    data: gv(STORE.CURRENT, null),
    region: gv(STORE.REGION, COUNTRIES[0]),
    tab: 'current',
    picking: false,
    open: false,
  };

  const CSS = window.CSS || { escape: s => s.replace(/[^a-zA-Z0-9_-]/g, '\\$&') };

  const STYLE = `
  :host {
    all: initial;
    /* ---- Light (default) ---- */
    --accent:#007aff; --accent-press:#0062cc; --on-accent:#fff;
    --green:#34c759; --red:#ff3b30; --orange:#ff9f0a;
    --text:#1d1d1f; --text2:#6e6e73; --text3:#8e8e93;
    --sep: rgba(60,60,67,.12);
    --fill: rgba(120,120,128,.12);
    --fill-strong: rgba(120,120,128,.20);
    --tint: color-mix(in srgb, var(--accent) 12%, transparent);
    --tint-red: color-mix(in srgb, var(--red) 12%, transparent);
    --material: rgba(250,250,252,.72);
    --material-blur: saturate(180%) blur(30px);
    --seg-on:#fff;
    --card: rgba(255,255,255,.55);
    --card-border: rgba(255,255,255,.5);
    --ball-bg: rgba(255,255,255,.62);
    --hairline: 0 .5px 0 var(--sep);
    --shadow: 0 16px 48px rgba(0,0,0,.20), 0 2px 10px rgba(0,0,0,.10);
    --shadow-sm: 0 6px 20px rgba(0,0,0,.16);
    --radius:22px;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :host {
      --accent:#0a84ff; --accent-press:#409cff; --on-accent:#fff;
      --green:#30d158; --red:#ff453a; --orange:#ff9f0a;
      --text:#f5f5f7; --text2:#aeaeb2; --text3:#8e8e93;
      --sep: rgba(84,84,88,.55);
      --fill: rgba(120,120,128,.24);
      --fill-strong: rgba(120,120,128,.40);
      --material: rgba(30,30,32,.72);
      --seg-on:#636366;
      --card: rgba(255,255,255,.07);
      --card-border: rgba(255,255,255,.10);
      --ball-bg: rgba(50,50,54,.62);
      --shadow: 0 16px 48px rgba(0,0,0,.55), 0 2px 10px rgba(0,0,0,.45);
      --shadow-sm: 0 6px 20px rgba(0,0,0,.5);
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    :host { --material:#f4f4f6; --ball-bg:#f4f4f6; --card:#fff; }
    @media (prefers-color-scheme: dark) { :host { --material:#1c1c1e; --ball-bg:#2c2c2e; --card:#2c2c2e; } }
    .panel, .ball, .pickmenu, .toast { backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
  }

  * { box-sizing: border-box; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }

  /* ---- Floating ball ---- */
  .ball { position: fixed; z-index: 2147483646; width: 50px; height: 50px; border-radius: 50%;
    background: var(--ball-bg); color: var(--text); display:flex; align-items:center; justify-content:center;
    font-size: 23px; line-height:1; cursor: grab; user-select:none; touch-action:none;
    backdrop-filter: var(--material-blur); -webkit-backdrop-filter: var(--material-blur);
    border: .5px solid var(--card-border);
    box-shadow: var(--shadow-sm), inset 0 .5px 0 rgba(255,255,255,.5);
    will-change: transform; transform: translateZ(0); }
  .ball:active { cursor: grabbing; }
  .ball.pressed { transform: scale(.9); }
  .ball.dragging { transform: scale(1.06); box-shadow: var(--shadow); }

  /* ---- Panel ---- */
  .panel { position: fixed; z-index: 2147483647; width: 376px; max-width: calc(100vw - 20px);
    height: 588px; max-height: calc(100vh - 20px);
    background: var(--material); color: var(--text);
    backdrop-filter: var(--material-blur); -webkit-backdrop-filter: var(--material-blur);
    border: .5px solid var(--card-border); border-radius: var(--radius);
    box-shadow: var(--shadow); opacity:0; visibility:hidden;
    display:flex; flex-direction:column; overflow:hidden;
    will-change: transform, opacity; transform-origin: 100% 100%; }
  .panel.show { visibility:visible; }

  /* ---- Header ---- */
  .hd { display:flex; align-items:center; gap:10px; padding:14px 16px 10px; flex:none; }
  .hd b { font-size:17px; font-weight:600; letter-spacing:-.01em; flex:1; color:var(--text); }
  .hd .x { flex:none; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    background: var(--fill); color: var(--text2); font-size:15px; cursor:pointer; transition: background .15s, transform .1s; }
  .hd .x:hover { background: var(--fill-strong); color: var(--text); }
  .hd .x:active { transform: scale(.9); }

  /* ---- Segmented tabs ---- */
  .seg { display:flex; gap:2px; margin:0 16px 6px; padding:2px; background:var(--fill); border-radius:10px; flex:none; }
  .seg-btn { flex:1; text-align:center; padding:6px 0; font-size:13px; font-weight:500; letter-spacing:-.01em;
    color:var(--text2); border-radius:8px; cursor:pointer; transition: color .18s; }
  .seg-btn.on { background:var(--seg-on); color:var(--text); font-weight:600;
    box-shadow: 0 1px 3px rgba(0,0,0,.12), 0 .5px 1px rgba(0,0,0,.08); }

  /* ---- Body (content scrolls under chrome) ---- */
  .body { flex:1; overflow-y:auto; overflow-x:hidden; padding:8px 16px 18px; box-shadow: inset 0 .5px 0 var(--sep);
    scrollbar-width: thin; scrollbar-color: var(--fill-strong) transparent; overscroll-behavior: contain; }
  .body::-webkit-scrollbar { width:7px; }
  .body::-webkit-scrollbar-thumb { background: var(--fill-strong); border-radius:4px; border:2px solid transparent; background-clip: content-box; }

  .row { display:flex; gap:8px; margin-bottom:10px; }
  select, input[type=text], textarea { width:100%; padding:9px 11px; border:.5px solid var(--sep); border-radius:11px;
    font-size:14px; color:var(--text); background:var(--card); transition: border-color .15s, box-shadow .15s; }
  select { -webkit-appearance:none; appearance:none; cursor:pointer;
    background-image: linear-gradient(45deg,transparent 50%,var(--text3) 50%),linear-gradient(135deg,var(--text3) 50%,transparent 50%);
    background-position: calc(100% - 15px) center, calc(100% - 10px) center; background-size:5px 5px,5px 5px; background-repeat:no-repeat; padding-right:30px; }
  select:focus, input:focus, textarea:focus { outline:none; border-color:var(--accent); box-shadow: 0 0 0 3px var(--tint); }

  /* ---- Buttons ---- */
  .btn { border:none; border-radius:12px; padding:10px 14px; font-size:14px; cursor:pointer; font-weight:590; letter-spacing:-.01em;
    color:var(--text); background:var(--fill); transition: transform .1s ease, background .15s, filter .15s; -webkit-user-select:none; user-select:none; }
  .btn:active { transform: scale(.96); }
  .btn.pri { background:var(--accent); color:var(--on-accent); }
  .btn.pri:hover { filter:brightness(1.05); }
  .btn.pri:active { background:var(--accent-press); }
  .btn.sec { background:var(--fill); color:var(--text); }
  .btn.sec:hover { background:var(--fill-strong); }
  .btn.gho { background:var(--tint); color:var(--accent); }
  .btn.warn { background:var(--tint-red); color:var(--red); }
  .btn:disabled { opacity:.4; cursor:not-allowed; transform:none; }

  .grp { margin-bottom:16px; }
  .grp h4 { margin:14px 0 6px; font-size:12px; color:var(--text3); font-weight:600; letter-spacing:.03em; text-transform:uppercase; }

  /* ---- Key/value cards ---- */
  .grp .kv:first-of-type { border-top-left-radius:12px; border-top-right-radius:12px; }
  .grp .kv:last-of-type { border-bottom-left-radius:12px; border-bottom-right-radius:12px; }
  .kv { display:flex; align-items:center; gap:8px; padding:9px 11px; font-size:13.5px; background:var(--card);
    border:.5px solid var(--sep); border-bottom:none; }
  .kv:last-of-type { border-bottom:.5px solid var(--sep); }
  .kv:hover { background:var(--fill); }
  .kv .k { width:74px; color:var(--text2); flex:none; letter-spacing:-.01em; }
  .kv .v { flex:1; word-break:break-all; color:var(--text); font-variant-numeric: tabular-nums; }
  .kv .cp { opacity:0; cursor:pointer; color:var(--accent); font-size:12px; flex:none; font-weight:590; transition: opacity .15s; }
  .kv:hover .cp { opacity:1; }
  .masked { letter-spacing:1.5px; color:var(--text2); }

  .actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0 4px; }
  .actions .btn { width:100%; }

  /* ---- List items ---- */
  .item { background:var(--card); border:.5px solid var(--sep); border-radius:14px; padding:12px; margin-bottom:9px; }
  .item .t { font-size:14px; font-weight:600; letter-spacing:-.01em; margin-bottom:3px; color:var(--text); }
  .item .s { font-size:12.5px; color:var(--text2); margin-bottom:9px; word-break:break-all; line-height:1.45; }
  .item .ops { display:flex; gap:6px; flex-wrap:wrap; }
  .item .ops .btn { padding:6px 11px; font-size:12.5px; border-radius:9px; }
  .empty { text-align:center; color:var(--text3); padding:52px 20px; font-size:13.5px; line-height:1.5; }

  /* ---- Settings rows ---- */
  .set-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 13px; font-size:14px;
    background:var(--card); border:.5px solid var(--sep); }
  .set-row:first-of-type { border-radius:12px 12px 0 0; }
  .set-row + .set-row { border-top:none; }
  .set-row:has(+ :not(.set-row)), .set-row:last-of-type { border-radius:0 0 12px 12px; }
  .switch { position:relative; width:46px; height:28px; flex:none; }
  .switch input { opacity:0; width:0; height:0; }
  .slider { position:absolute; inset:0; background:var(--fill-strong); border-radius:28px; cursor:pointer;
    transition: background .28s cubic-bezier(.2,.8,.2,1); }
  .slider:before { content:""; position:absolute; height:24px; width:24px; left:2px; top:2px; background:#fff; border-radius:50%;
    box-shadow:0 2px 4px rgba(0,0,0,.2); transition: transform .28s cubic-bezier(.2,.8,.2,1); }
  input:checked + .slider { background:var(--green); }
  input:checked + .slider:before { transform:translateX(18px); }

  /* ---- Toast ---- */
  .toast { position:fixed; z-index:2147483647; left:50%; bottom:44px; transform:translateX(-50%) translateY(10px) scale(.96);
    background:rgba(40,40,42,.82); color:#fff; padding:11px 18px; border-radius:14px; font-size:13.5px; font-weight:500;
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border:.5px solid rgba(255,255,255,.12);
    box-shadow:0 8px 30px rgba(0,0,0,.35); opacity:0; pointer-events:none;
    transition: opacity .25s, transform .35s cubic-bezier(.2,.9,.3,1.2); }
  .toast.show { opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
  .toast.ok:before { content:"✓ "; color:var(--green); font-weight:700; }
  .toast.warn:before { content:"⚠ "; color:var(--orange); }
  .toast.err:before { content:"✕ "; color:var(--red); font-weight:700; }

  /* ---- Pick menu ---- */
  .pickmenu { position:fixed; z-index:2147483647; background:var(--material); color:var(--text);
    backdrop-filter: var(--material-blur); -webkit-backdrop-filter: var(--material-blur);
    border:.5px solid var(--card-border); border-radius:14px; box-shadow:var(--shadow); padding:6px; max-height:320px; overflow:auto; width:214px;
    transform-origin: top left; }
  .pickmenu div { padding:8px 10px; font-size:13px; border-radius:9px; cursor:pointer; display:flex; justify-content:space-between; gap:8px; align-items:center; }
  .pickmenu div:hover { background:var(--fill); }
  .pickmenu .pv { color:var(--text3); max-width:104px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-variant-numeric: tabular-nums; }
  .note { font-size:12px; color:var(--text3); margin-top:12px; line-height:1.55; }
  .hl-flash { outline:2px solid var(--accent) !important; outline-offset:1px; }
  @media (prefers-reduced-motion: reduce) {
    .btn:active, .ball.pressed, .hd .x:active { transform:none; }
    .toast { transition: opacity .2s; transform:translateX(-50%); }
    .toast.show { transform:translateX(-50%); }
  }
  `;

  const reduceMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* rAF numeric spring — interruptible, velocity-aware (returns a cancel fn) */
  function springTo(o) {
    let x = o.from, v = o.velocity || 0, last = null, raf = 0, cancelled = false;
    const k = o.stiffness == null ? 300 : o.stiffness;
    const c = o.damping == null ? 30 : o.damping;
    const m = o.mass || 1, prec = o.precision || 0.002;
    function step(t) {
      if (cancelled) return;
      if (last == null) { last = t; raf = requestAnimationFrame(step); return; }
      let dt = (t - last) / 1000; last = t; if (dt > 1 / 30) dt = 1 / 30;
      const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n; // substep for stability
      for (let i = 0; i < n; i++) { const a = (-k * (x - o.to) - c * v) / m; v += a * h; x += v * h; }
      if (Math.abs(v) < prec && Math.abs(x - o.to) < prec) { x = o.to; o.onUpdate && o.onUpdate(x); o.onComplete && o.onComplete(); return; }
      o.onUpdate && o.onUpdate(x); raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }
  /* momentum projection (Apple's exponential-decay form) + rubber-band resistance */
  function project(vel, rate) { rate = rate || 0.998; return (vel / 1000) * rate / (1 - rate); }
  function band(overshoot, dim, c) { c = c || 0.55; return (overshoot * dim * c) / (dim + c * Math.abs(overshoot)); }
  function rubber(val, min, max, dim) {
    if (val < min) return min - band(min - val, dim);
    if (val > max) return max + band(val - max, dim);
    return val;
  }

  function buildUI() {
    const host = document.createElement('div');
    host.id = 'mgdz-root';
    (document.body || document.documentElement).appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = STYLE; root.appendChild(style);

    // 页面级样式：填充闪烁（Shadow DOM 内的规则不会作用到宿主页面的输入框）
    const flash = document.createElement('style');
    flash.textContent = '.mgdz-hl-flash{outline:2px solid #007aff !important;outline-offset:1px;transition:outline .25s ease;}@media (prefers-color-scheme:dark){.mgdz-hl-flash{outline-color:#0a84ff !important;}}';
    (document.head || document.documentElement).appendChild(flash);

    const ball = document.createElement('div');
    ball.className = 'ball'; ball.textContent = '🇺🇸'; ball.title = '美国地址生成器（拖拽移动 / 单击展开）';
    root.appendChild(ball);
    restorePos(ball);
    makeDraggable(ball, () => togglePanel());

    panel = document.createElement('div');
    panel.className = 'panel';
    root.appendChild(panel);
    renderPanel();
  }

  function restorePos(ball) {
    const p = gv(STORE.POS, null);
    if (p) { ball.style.left = p.left; ball.style.top = p.top; ball.style.right = 'auto'; ball.style.bottom = 'auto'; }
    else { ball.style.right = '18px'; ball.style.bottom = '96px'; }
  }

  function persistBall(x, y) { sv(STORE.POS, { left: x + 'px', top: y + 'px' }); }

  function makeDraggable(el, onClick) {
    let dragging = false, moved = false, pid = null, grabX = 0, grabY = 0, sx = 0, sy = 0;
    let bx = 0, by = 0, hist = [], cancelX = null, cancelY = null;
    const applyBall = () => { el.style.left = bx + 'px'; el.style.top = by + 'px'; el.style.right = 'auto'; el.style.bottom = 'auto'; if (state.open) positionPanel(); };

    el.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0) return;
      dragging = true; moved = false; pid = e.pointerId;
      try { el.setPointerCapture(pid); } catch (_) {}
      if (cancelX) cancelX(); if (cancelY) cancelY();
      const r = el.getBoundingClientRect(); bx = r.left; by = r.top;
      grabX = e.clientX - r.left; grabY = e.clientY - r.top; sx = e.clientX; sy = e.clientY;
      hist = [{ t: e.timeStamp, x: bx, y: by }];
      el.classList.add('pressed');
      e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      if (!moved && (Math.abs(e.clientX - sx) > 4 || Math.abs(e.clientY - sy) > 4)) {
        moved = true; el.classList.remove('pressed'); el.classList.add('dragging');
        if (state.open) togglePanel(false);
      }
      if (!moved) return;
      const maxX = innerWidth - el.offsetWidth, maxY = innerHeight - el.offsetHeight;
      bx = rubber(e.clientX - grabX, 0, maxX, el.offsetWidth);
      by = rubber(e.clientY - grabY, 0, maxY, el.offsetHeight);
      applyBall();
      hist.push({ t: e.timeStamp, x: bx, y: by }); if (hist.length > 6) hist.shift();
    });
    function end() {
      if (!dragging) return; dragging = false; el.classList.remove('pressed');
      try { el.releasePointerCapture(pid); } catch (_) {}
      if (!moved) { el.classList.remove('dragging'); onClick(); return; }
      el.classList.remove('dragging');
      const a = hist[0], b = hist[hist.length - 1]; let dt = (b.t - a.t) / 1000; if (!dt || dt < 0.008) dt = 0.016;
      const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      const maxX = innerWidth - el.offsetWidth, maxY = innerHeight - el.offsetHeight, M = 12;
      const projX = bx + project(vx), projY = by + project(vy);
      const targetX = (projX + el.offsetWidth / 2 < innerWidth / 2) ? M : maxX - M;   // 甩向最近的水平边缘
      const targetY = Math.max(M, Math.min(maxY - M, projY));
      if (reduceMotion()) { bx = targetX; by = targetY; applyBall(); persistBall(bx, by); return; }
      // 2D 拆分为独立的 X / Y 弹簧，各自带入释放速度
      cancelX = springTo({ from: bx, to: targetX, velocity: vx, stiffness: 220, damping: 22, onUpdate: v => { bx = v; applyBall(); }, onComplete: () => persistBall(bx, by) });
      cancelY = springTo({ from: by, to: targetY, velocity: vy, stiffness: 220, damping: 26, onUpdate: v => { by = v; applyBall(); }, onComplete: () => persistBall(bx, by) });
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  let panelP = 0, panelCancel = null;
  function applyPanel() {
    const s = 0.86 + 0.14 * panelP;
    panel.style.opacity = Math.max(0, Math.min(1, panelP * 1.25)).toFixed(3);
    panel.style.transform = 'scale(' + s.toFixed(4) + ')';
  }
  function togglePanel(force) {
    state.open = force != null ? force : !state.open;
    if (state.open) { panel.classList.add('show'); positionPanel(); renderPanel(); }
    if (panelCancel) panelCancel();
    const target = state.open ? 1 : 0;
    if (reduceMotion()) {
      panelP = target; applyPanel();
      if (!state.open) panel.classList.remove('show');
      return;
    }
    // 从当前呈现值出发的可打断弹簧；开启带一点点过冲，关闭则临界阻尼
    panelCancel = springTo({
      from: panelP, to: target,
      stiffness: state.open ? 340 : 380, damping: state.open ? 30 : 34,
      onUpdate: v => { panelP = v; applyPanel(); },
      onComplete: () => { panelP = target; applyPanel(); if (!state.open) panel.classList.remove('show'); },
    });
  }
  function positionPanel() {
    const b = root.querySelector('.ball').getBoundingClientRect();
    const W = Math.min(376, innerWidth - 20), H = Math.min(588, innerHeight - 20);
    let left = b.left - W - 12;
    if (left < 10) left = Math.min(b.right + 12, innerWidth - W - 10);
    if (left < 10) left = 10;
    let top = b.top + b.height / 2 - H / 2;
    top = Math.max(10, Math.min(top, innerHeight - H - 10));
    panel.style.left = left + 'px'; panel.style.top = top + 'px';
    panel.style.width = W + 'px'; panel.style.height = H + 'px';
    // 空间一致性：让面板从悬浮球所在的角落生长
    const ox = Math.max(0, Math.min(W, b.left + b.width / 2 - left));
    const oy = Math.max(0, Math.min(H, b.top + b.height / 2 - top));
    panel.style.transformOrigin = ox + 'px ' + oy + 'px';
  }

  /* ---------- 渲染 ---------- */
  function renderPanel() {
    if (!state.open) return;
    panel.innerHTML = '';
    panel.appendChild(el('div', 'hd', [
      el('b', '', '地址一键填充'),
      elx('span', 'x', '✕', { click: () => togglePanel(false) }),
    ]));
    const seg = el('div', 'seg');
    [['current', '当前'], ['favs', '收藏'], ['logs', '记录'], ['settings', '设置']].forEach(([k, t]) => {
      seg.appendChild(elx('div', 'seg-btn' + (state.tab === k ? ' on' : ''), t, { click: () => { state.tab = k; renderPanel(); } }));
    });
    panel.appendChild(seg);
    const body = el('div', 'body'); panel.appendChild(body);
    ({ current: renderCurrent, favs: renderFavs, logs: renderLogs, settings: renderSettings }[state.tab])(body);
  }

  function renderCurrent(body) {
    // 地区选择
    const rrow = el('div', 'row');
    const selC = document.createElement('select');
    COUNTRIES.forEach(c => selC.appendChild(opt(c.path, c.label, c.path === state.region.path && !state.region.sub)));
    selC.onchange = () => { const c = COUNTRIES.find(x => x.path === selC.value); state.region = Object.assign({}, c); persistRegion(); renderPanel(); };
    rrow.appendChild(selC);

    // 美国二级：州 / 城市
    if (state.region.country === 'United States') {
      const selS = document.createElement('select');
      selS.appendChild(opt('/', '— 全美随机 —', false));
      const og1 = document.createElement('optgroup'); og1.label = '按州';
      US_STATES.forEach(([cn, sl]) => og1.appendChild(opt('/usa-address/' + sl, cn, state.region.path === '/usa-address/' + sl)));
      const og2 = document.createElement('optgroup'); og2.label = '按热门城市';
      US_CITIES.forEach(([cn, sl]) => og2.appendChild(opt('/usa-address/hot-city-' + sl, cn, state.region.path === '/usa-address/hot-city-' + sl)));
      selS.appendChild(og1); selS.appendChild(og2);
      selS.value = state.region.path;
      selS.onchange = () => {
        state.region = Object.assign({}, COUNTRIES[0], { path: selS.value, sub: selS.value !== '/', label: selS.selectedOptions[0].text.replace(/^—|—$/g, '').trim() || '美国' });
        state.region.country = 'United States'; state.region.aliases = COUNTRIES[0].aliases;
        persistRegion(); renderPanel();
      };
      rrow.appendChild(selS);
    }
    body.appendChild(rrow);

    // 操作
    const gen = elx('button', 'btn pri', '🎲 换一批', { click: doGenerate });
    gen.style.flex = '1';
    body.appendChild(el('div', 'row', [gen]));

    if (!state.data) { body.appendChild(el('div', 'empty', '点击「换一批」获取一条身份数据')); return; }

    const acts = el('div', 'actions');
    acts.appendChild(elx('button', 'btn pri', '⚡ 填充此页', { click: () => fillPage(state.data, state.region) }));
    acts.appendChild(elx('button', 'btn sec', state.picking ? '● 点选中…' : '🎯 手动点选', { click: togglePick }));
    acts.appendChild(elx('button', 'btn gho', '★ 收藏', { click: () => askNote(n => addFavorite(state.data, state.region, n)) }));
    acts.appendChild(elx('button', 'btn sec', '⧉ 复制全部', { click: copyAll }));
    body.appendChild(acts);

    const s = getSettings();
    GROUPS.forEach(g => {
      const kvs = g.keys.filter(k => state.data[k] != null && state.data[k] !== '');
      if (!kvs.length) return;
      const grp = el('div', 'grp', [el('h4', '', g.title)]);
      kvs.forEach(k => {
        const masked = s.maskSensitive && SENSITIVE.has(k);
        const vEl = el('span', 'v' + (masked ? ' masked' : ''), masked ? mask(state.data[k]) : state.data[k]);
        if (masked) { vEl.style.cursor = 'pointer'; vEl.title = '点击显示'; vEl.onclick = () => { vEl.textContent = state.data[k]; vEl.classList.remove('masked'); }; }
        grp.appendChild(el('div', 'kv', [
          el('span', 'k', LABELS[k] || k), vEl,
          elx('span', 'cp', '复制', { click: () => copy(state.data[k]) }),
        ]));
      });
      body.appendChild(grp);
    });
    body.appendChild(el('div', 'note', '数据来自 meiguodizhi.com，为“仅供学习地址格式”的虚构测试数据，请勿用于非法用途。'));
  }

  function renderFavs(body) {
    const favs = gv(STORE.FAVS, []);
    const tools = el('div', 'row');
    tools.appendChild(elx('button', 'btn sec', '⬆ 导入', { click: importData }));
    tools.appendChild(elx('button', 'btn sec', '⬇ 导出', { click: () => exportData('favs') }));
    body.appendChild(tools);
    if (!favs.length) { body.appendChild(el('div', 'empty', '暂无收藏。在「当前」页点 ★ 收藏一条身份。')); return; }
    favs.forEach(f => {
      const d = f.data;
      const item = el('div', 'item', [
        el('div', 't', `${d.Full_Name || '—'}　·　${f.region}`),
        el('div', 's', `${d.Address || ''}, ${d.City || ''}, ${d.State || ''} ${d.Zip_Code || ''}` + (f.note ? `　📝${f.note}` : '') + `　·　${f.time}`),
        el('div', 'ops', [
          elx('button', 'btn pri', '填充', { click: () => { state.data = d; state.region = { label: f.region, path: f.path, country: guessCountry(f), aliases: [] }; fillPage(d, state.region); } }),
          elx('button', 'btn sec', '设为当前', { click: () => { state.data = d; sv(STORE.CURRENT, d); state.tab = 'current'; renderPanel(); } }),
          elx('button', 'btn sec', '备注', { click: () => askNote(n => { f.note = n; sv(STORE.FAVS, favs); renderPanel(); }, f.note) }),
          elx('button', 'btn warn', '删除', { click: () => { sv(STORE.FAVS, favs.filter(x => x.id !== f.id)); renderPanel(); } }),
        ]),
      ]);
      body.appendChild(item);
    });
  }

  function renderLogs(body) {
    const logs = gv(STORE.LOGS, []);
    const tools = el('div', 'row');
    tools.appendChild(elx('button', 'btn sec', '⬇ 导出', { click: () => exportData('logs') }));
    tools.appendChild(elx('button', 'btn warn', '清空记录', { click: () => { if (confirm('确定清空所有使用记录？')) { sv(STORE.LOGS, []); renderPanel(); } } }));
    body.appendChild(tools);
    if (!logs.length) { body.appendChild(el('div', 'empty', '暂无使用记录。填充表单后会自动记录网址。')); return; }
    // 按 host 分组
    const byHost = {};
    logs.forEach(l => { (byHost[l.host] = byHost[l.host] || []).push(l); });
    Object.keys(byHost).forEach(host => {
      const grp = el('div', 'grp', [el('h4', '', `${host}（${byHost[host].length}）`)]);
      byHost[host].slice(0, 30).forEach(l => {
        grp.appendChild(el('div', 'item', [
          el('div', 't', l.summary),
          el('div', 's', `${l.time}　·　填充${l.count}项　·　${l.region}`),
          el('div', 'ops', [
            elx('button', 'btn sec', '打开网址', { click: () => window.open(l.url, '_blank', 'noopener') }),
            elx('button', 'btn sec', '复制网址', { click: () => copy(l.url) }),
          ]),
        ]));
      });
      body.appendChild(grp);
    });
  }

  function toggleRow(label, checked, onChange) {
    const wrap = el('div', 'set-row');
    wrap.appendChild(el('span', '', label));
    const sw = document.createElement('label'); sw.className = 'switch';
    const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = !!checked;
    inp.onchange = () => onChange(inp.checked);
    const sl = document.createElement('span'); sl.className = 'slider';
    sw.appendChild(inp); sw.appendChild(sl); wrap.appendChild(sw);
    return wrap;
  }

  function renderSettings(body) {
    const s = getSettings();

    // ---- 通用 ----
    const gen = el('div', 'grp', [el('h4', '', '通用')]);
    gen.appendChild(toggleRow('敏感字段遮罩（卡号/CVV/SSN/密码）', s.maskSensitive, v => { s.maskSensitive = v; sv(STORE.SETTINGS, s); }));
    gen.appendChild(toggleRow('填充时自动记录网址', s.autoRecord, v => { s.autoRecord = v; sv(STORE.SETTINGS, s); }));
    body.appendChild(gen);

    // ---- 作用范围 ----
    const scope = el('div', 'grp', [el('h4', '', '作用范围')]);
    scope.appendChild(toggleRow('在本站显示悬浮球', siteEnabled(location.host), v => {
      setSiteEnabled(location.host, v);
      toast(v ? '已在本站启用' : '本站已停用（刷新后隐藏悬浮球）', v ? 'ok' : 'warn');
      renderPanel();
    }));
    scope.appendChild(el('div', 'note', '当前站点：' + location.host));

    const modeRow = el('div', 'set-row');
    modeRow.appendChild(el('span', '', '注入模式'));
    const selM = document.createElement('select');
    [['all', '全部站点'], ['whitelist', '仅白名单'], ['blacklist', '黑名单以外']].forEach(([v, t]) => selM.appendChild(opt(v, t, s.mode === v)));
    selM.onchange = () => { const s2 = getSettings(); s2.mode = selM.value; sv(STORE.SETTINGS, s2); renderPanel(); };
    modeRow.appendChild(selM);
    scope.appendChild(modeRow);

    if (s.mode !== 'all') {
      const isW = s.mode === 'whitelist';
      const list = (isW ? s.whitelist : s.blacklist) || [];
      scope.appendChild(el('div', 'note', (isW ? '白名单' : '黑名单') + '（每行一个域名，支持通配 *.example.com）'));
      const ta = document.createElement('textarea'); ta.rows = 4; ta.value = list.join('\n');
      ta.style.resize = 'vertical'; ta.style.minHeight = '76px';
      ta.placeholder = 'example.com\nshop.example.com\n*.mysite.com';
      ta.onchange = () => {
        const arr = ta.value.split('\n').map(x => x.trim()).filter(Boolean);
        const s2 = getSettings(); if (isW) s2.whitelist = arr; else s2.blacklist = arr; sv(STORE.SETTINGS, s2);
      };
      scope.appendChild(el('div', 'row', [ta]));
    }
    body.appendChild(scope);

    // ---- 数据维护 ----
    const danger = el('div', 'grp', [el('h4', '', '数据维护')]);
    danger.appendChild(el('div', 'row', [
      elx('button', 'btn sec', '导出全部数据', { click: () => exportData('all') }),
      elx('button', 'btn sec', '导入数据', { click: importData }),
    ]));
    danger.appendChild(el('div', 'row', [
      elx('button', 'btn warn', '清空手动映射', { click: () => { sv(STORE.MAPS, {}); toast('已清空本机所有站点的字段映射', 'ok'); } }),
    ]));
    body.appendChild(danger);
    body.appendChild(el('div', 'note', `版本 1.2.0　·　收藏 ${gv(STORE.FAVS, []).length} 条　·　记录 ${gv(STORE.LOGS, []).length} 条`));
  }

  /* =========================================================================
   * 8. 交互动作
   * =======================================================================*/
  async function doGenerate() {
    const btns = root.querySelectorAll('.btn.pri');
    toast('生成中…');
    try {
      const data = await fetchAddress(state.region.path);
      state.data = data; sv(STORE.CURRENT, data); persistRegion();
      renderPanel(); toast('已生成', 'ok');
    } catch (e) { toast('生成失败：' + e.message, 'err'); }
  }
  function persistRegion() { sv(STORE.REGION, state.region); }

  function copy(text) {
    try { navigator.clipboard.writeText(text); toast('已复制', 'ok'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('已复制', 'ok'); }
  }
  function copyAll() {
    const d = state.data; if (!d) return;
    const lines = GROUPS.flatMap(g => g.keys.filter(k => d[k]).map(k => `${LABELS[k] || k}: ${d[k]}`));
    copy(lines.join('\n'));
  }

  function togglePick() {
    state.picking = !state.picking;
    document.body.style.cursor = state.picking ? 'crosshair' : '';
    toast(state.picking ? '点选模式：点击页面上的输入框，再选择要填入的字段' : '已退出点选', state.picking ? 'ok' : 'warn');
    renderPanel();
  }

  // 点选模式：捕获页面输入框点击
  document.addEventListener('click', function (e) {
    if (!state.picking || !state.data) return;
    const path = e.composedPath();
    if (path.some(n => n.id === 'mgdz-root')) return; // 忽略面板自身
    const el = path.find(n => n.tagName && (/^(input|textarea|select)$/i.test(n.tagName) || isEditable(n)));
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    showPickMenu(el, e.clientX, e.clientY);
  }, true);

  function showPickMenu(target, x, y) {
    root.querySelectorAll('.pickmenu').forEach(m => m.remove());
    const menu = el('div', 'pickmenu');
    const d = state.data;
    const entries = [];
    SEMANTIC.forEach(f => { const v = f.get(d, state.region); if (v) entries.push([f, v]); });
    // 也允许直接选原始字段
    entries.forEach(([f, v]) => {
      menu.appendChild(elx('div', '', [document.createTextNode(fieldLabel(f.key)), el('span', 'pv', String(v))], {
        click: () => {
          const tt = target.tagName.toLowerCase();
          const ty = (target.getAttribute('type') || '').toLowerCase();
          if (tt === 'select') fillSelect(target, v, aliasesFor(f, d, state.region));
          else if (ty === 'radio' || ty === 'checkbox') fillCheckable(target, v, aliasesFor(f, d, state.region));
          else if (isEditable(target)) { setEditable(target, v); highlight(target); }
          else { setNativeValue(target, v); highlight(target); }
          // 记忆映射
          const maps = gv(STORE.MAPS, {}); const sig = signatureOf(target);
          if (sig) { maps[location.host] = maps[location.host] || {}; maps[location.host][sig] = f.key; sv(STORE.MAPS, maps); }
          menu.remove();
          if (getSettings().autoRecord) recordUsage(d, state.region, 1);
          toast('已填入并记住该字段', 'ok');
        }
      }));
    });
    menu.style.left = Math.min(x, innerWidth - 210) + 'px';
    menu.style.top = Math.min(y, innerHeight - 310) + 'px';
    root.appendChild(menu);
    setTimeout(() => document.addEventListener('click', function close(ev) {
      if (!ev.composedPath().includes(menu)) { menu.remove(); document.removeEventListener('click', close, true); }
    }, true), 0);
  }

  function fieldLabel(key) {
    const m = { email: '邮箱', firstName: '名(First)', lastName: '姓(Last)', fullName: '全名', gender: '性别', title: '称谓',
      phone: '电话', zip: '邮编', country: '国家', state: '州/省', city: '城市', address: '街道地址', company: '公司', ccName: '持卡人',
      ccNumber: '信用卡号', cvv: 'CVV', ccExp: '有效期', ssn: 'SSN', username: '用户名', password: '密码' };
    return m[key] || key;
  }

  /* ---------- 导入导出 ---------- */
  function exportData(kind) {
    const payload = kind === 'all'
      ? { favs: gv(STORE.FAVS, []), logs: gv(STORE.LOGS, []), maps: gv(STORE.MAPS, {}), settings: getSettings() }
      : kind === 'favs' ? { favs: gv(STORE.FAVS, []) } : { logs: gv(STORE.LOGS, []) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `mgdz-${kind}-${Date.now()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('已导出', 'ok');
  }
  function importData() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = () => {
      const file = inp.files[0]; if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const j = JSON.parse(fr.result);
          if (j.favs) sv(STORE.FAVS, mergeById(gv(STORE.FAVS, []), j.favs));
          if (j.logs) sv(STORE.LOGS, mergeById(gv(STORE.LOGS, []), j.logs));
          if (j.maps) sv(STORE.MAPS, Object.assign(gv(STORE.MAPS, {}), j.maps));
          if (j.settings) sv(STORE.SETTINGS, Object.assign(getSettings(), j.settings));
          renderPanel(); toast('导入成功', 'ok');
        } catch (e) { toast('导入失败：文件格式错误', 'err'); }
      };
      fr.readAsText(file);
    };
    inp.click();
  }
  function mergeById(a, b) {
    const map = {}; [...a, ...b].forEach(x => { map[x.id || JSON.stringify(x.data || x)] = x; });
    return Object.values(map);
  }

  /* =========================================================================
   * 9. 小工具
   * =======================================================================*/
  function el(tag, cls, kids) {
    const n = document.createElement(tag); if (cls) n.className = cls;
    if (kids != null) {
      if (typeof kids === 'string') n.textContent = kids;
      else if (Array.isArray(kids)) kids.forEach(k => k && n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
      else n.appendChild(kids);
    }
    return n;
  }
  function elx(tag, cls, kids, ev) {
    const n = el(tag, cls, kids);
    if (ev) Object.keys(ev).forEach(k => n.addEventListener(k, ev[k]));
    return n;
  }
  function opt(value, text, selected) { const o = document.createElement('option'); o.value = value; o.textContent = text; if (selected) o.selected = true; return o; }
  function mask(v) { v = String(v); return v.length <= 4 ? '••••' : v.slice(0, 2) + '••••••' + v.slice(-2); }
  function guessCountry(f) { const c = COUNTRIES.find(x => x.path === f.path || x.label === f.region); return c ? c.country : (f.data && f.data.State_Full ? 'United States' : ''); }
  function highlight(elm) { try { elm.classList.add('mgdz-hl-flash'); setTimeout(() => elm.classList.remove('mgdz-hl-flash'), 800); } catch (e) {} }

  function askNote(cb, def) {
    const v = prompt('备注（可留空）：', def || '');
    if (v !== null) cb(v);
  }

  let toastEl, toastT;
  function toast(msg, kind) {
    if (!root) return;
    if (!toastEl || toastEl.getRootNode() !== root) { toastEl = el('div', 'toast'); root.appendChild(toastEl); }
    toastEl.className = 'toast ' + (kind || '') + ' show';
    toastEl.textContent = msg;
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* =========================================================================
   * 10. 启动
   * =======================================================================*/
  function removeUI() {
    const existing = document.getElementById('mgdz-root');
    if (existing) existing.remove();
    root = null; panel = null; toastEl = null; state.open = false; panelP = 0;
  }
  function ensureUI() { if (!document.getElementById('mgdz-root')) buildUI(); }

  function registerMenus() {
    try {
      GM_registerMenuCommand('打开面板', () => { ensureUI(); togglePanel(true); });
      GM_registerMenuCommand('换一批并填充此页', async () => { ensureUI(); await doGenerate(); fillPage(state.data, state.region); });
      GM_registerMenuCommand('在本站启用 / 停用悬浮球', () => {
        const next = !siteEnabled(location.host);
        setSiteEnabled(location.host, next);
        if (next) ensureUI(); else removeUI();
      });
    } catch (e) {}
  }

  function start() {
    if (window.top !== window) return;             // 仅顶层窗口
    if (document.getElementById('mgdz-root')) return;
    registerMenus();                               // 菜单始终注册，便于在停用站点重新启用
    if (!siteEnabled(location.host)) return;        // 作用范围：黑/白名单未命中则不注入
    buildUI();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

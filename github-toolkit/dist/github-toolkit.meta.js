// ==UserScript==
// @name         GitHub Toolkit
// @namespace    github-toolkit
// @version      2.9.0
// @author       Cores
// @description  高内聚低耦合的 GitHub 模块化工具台（图标操作 + 复制上游链接）
// @license      MIT
// @icon         https://github.githubassets.com/favicons/favicon.svg
// @downloadURL  https://raw.githubusercontent.com/coresZ/userscript/refs/heads/main/github-toolkit/dist/github-toolkit.user.js
// @updateURL    https://raw.githubusercontent.com/coresZ/userscript/refs/heads/main/github-toolkit/dist/github-toolkit.meta.js
// @match        https://github.com/*
// @match        https://gist.github.com/*
// @require      https://update.greasyfork.org/scripts/593538/webdev-component.js
// @connect      api.github.com
// @connect      *
// @grant        GM_addStyle
// @grant        GM_deleteValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==
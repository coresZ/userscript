// ==UserScript==
// @name         抖音下载
// @namespace    https://github.com/zhzLuke96/douyin-dl-user-js
// @version      1.0.9
// @description  为web版抖音增加下载按钮，下载前二次确认（文件名过长截断），图集图片大于1张时打包ZIP下载。
// @author       zhzluke96 (modified by AI)
// @match        https://*.douyin.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=douyin.com
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @grant        none
// @license      MIT
// @supportURL   https://github.com/zhzLuke96/douyin-dl-user-js/issues
// @downloadURL https://update.greasyfork.org/scripts/522326/%E6%8A%96%E9%9F%B3%E4%B8%8B%E8%BD%BD.user.js
// @updateURL https://update.greasyfork.org/scripts/522326/%E6%8A%96%E9%9F%B3%E4%B8%8B%E8%BD%BD.meta.js
// ==/UserScript==

(function () {
  "use strict";

  // --- 调试开关 ---
  const DEBUG = false;
  const logDebug = (...args) => DEBUG && console.log("[dy-dl-debug]", ...args);
  const logError = (...args) => console.error("[dy-dl-error]", ...args);
  const logWarn = (...args) => console.warn("[dy-dl-warn]", ...args);


  /**
   * 显示自定义提示框
   * @param {string} message - 要显示的消息
   * @returns {Promise<void>} - 当用户点击确定时 resolve
   */
  function showCustomAlert(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0,0,0,0.6); display: flex;
        justify-content: center; align-items: center; z-index: 10001;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
      `;

      const modal = document.createElement("div");
      modal.style.cssText = `
        background-color: white; padding: 25px; border-radius: 12px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.25); text-align: center;
        min-width: 280px; max-width: 90%; animation: dy-dl-modal-appear 0.3s ease-out;
        word-break: break-word;
      `;

      const messageP = document.createElement("p");
      messageP.textContent = message;
      messageP.style.cssText = "margin: 0 0 20px; font-size: 16px; color: #333; line-height: 1.5;";

      const okButton = document.createElement("button");
      okButton.textContent = "确定";
      okButton.style.cssText = `
        padding: 10px 25px; background-color: #007bff; color: white;
        border: none; border-radius: 6px; cursor: pointer; font-size: 15px;
        transition: background-color 0.2s ease;
      `;
      okButton.onmouseover = () => okButton.style.backgroundColor = '#0056b3';
      okButton.onmouseout = () => okButton.style.backgroundColor = '#007bff';


      okButton.onclick = () => {
        modal.style.animation = 'dy-dl-modal-disappear 0.3s ease-in';
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                 document.body.removeChild(overlay);
            }
        }, 280);
        resolve();
      };

      modal.appendChild(messageP);
      modal.appendChild(okButton);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const styleSheetId = "dy-dl-modal-styles";
      if (!document.getElementById(styleSheetId)) {
        const styleSheet = document.createElement("style");
        styleSheet.id = styleSheetId;
        styleSheet.type = "text/css";
        styleSheet.innerText = `
            @keyframes dy-dl-modal-appear {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
            }
            @keyframes dy-dl-modal-disappear {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.9); }
            }
        `;
        document.head.appendChild(styleSheet);
      }
    });
  }

  /**
   * 显示自定义确认框
   * @param {string} message - 要显示的消息
   * @returns {Promise<boolean>} - 用户点击确定时 resolve true, 点击取消时 resolve false
   */
  function showCustomConfirm(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0,0,0,0.6); display: flex;
        justify-content: center; align-items: center; z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
      `;

      const modal = document.createElement("div");
      modal.style.cssText = `
        background-color: white; padding: 25px; border-radius: 12px;
        box-shadow: 0 5px 20px rgba(0,0,0,0.25); text-align: center;
        min-width: 320px; max-width: 90%; animation: dy-dl-modal-appear 0.3s ease-out;
        word-break: break-word;
      `;

      const messageP = document.createElement("p");
      messageP.textContent = message;
      messageP.style.cssText = "margin: 0 0 25px; font-size: 16px; color: #333; line-height: 1.5;";

      const buttonContainer = document.createElement("div");
      buttonContainer.style.cssText = "display: flex; justify-content: space-evenly;";

      const confirmButton = document.createElement("button");
      confirmButton.textContent = "确定下载";
      confirmButton.style.cssText = `
        padding: 10px 20px; background-color: #28a745; color: white;
        border: none; border-radius: 6px; cursor: pointer; font-size: 15px;
        transition: background-color 0.2s ease; margin-right: 10px;
      `;
      confirmButton.onmouseover = () => confirmButton.style.backgroundColor = '#1e7e34';
      confirmButton.onmouseout = () => confirmButton.style.backgroundColor = '#28a745';


      const cancelButton = document.createElement("button");
      cancelButton.textContent = "取消";
      cancelButton.style.cssText = `
        padding: 10px 20px; background-color: #6c757d; color: white;
        border: none; border-radius: 6px; cursor: pointer; font-size: 15px;
        transition: background-color 0.2s ease;
      `;
      cancelButton.onmouseover = () => cancelButton.style.backgroundColor = '#545b62';
      cancelButton.onmouseout = () => cancelButton.style.backgroundColor = '#6c757d';

      const closeModal = (value) => {
        modal.style.animation = 'dy-dl-modal-disappear 0.3s ease-in';
        setTimeout(() => {
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }, 280);
        resolve(value);
      };

      confirmButton.onclick = () => closeModal(true);
      cancelButton.onclick = () => closeModal(false);

      buttonContainer.appendChild(confirmButton);
      buttonContainer.appendChild(cancelButton);
      modal.appendChild(messageP);
      modal.appendChild(buttonContainer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const styleSheetId = "dy-dl-modal-styles";
      if (!document.getElementById(styleSheetId)) {
        const styleSheet = document.createElement("style");
        styleSheet.id = styleSheetId;
        styleSheet.type = "text/css";
        styleSheet.innerText = `
            @keyframes dy-dl-modal-appear {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
            }
            @keyframes dy-dl-modal-disappear {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.9); }
            }
        `;
        document.head.appendChild(styleSheet);
      }
    });
  }

  /**
   * @param node {HTMLElement}
   * @returns {HTMLElement | null}
   */
  function findImage(node) {
    let img = null;
    let currentNode = node;
    while (currentNode) {
      img = currentNode.querySelector("img");
      if (img) return img;
      if (currentNode.parentNode === currentNode || !currentNode.parentNode) break;
      currentNode = currentNode.parentNode;
    }
    return img;
  }

  /**
   * @param html {string}
   * @returns {HTMLElement}
   */
  function render_html(html) {
    const div = document.createElement("div");
    div.innerHTML = html;
    return div.children[0];
  }

  /**
   * @param {Blob} blob
   * @returns {Promise<Blob>}
   */
  async function convertWebPToPNG(blob) {
    logDebug("convertWebPToPNG: Starting conversion for blob", blob);
    const img = new Image();
    const objectURL = URL.createObjectURL(blob);
    img.src = objectURL;

    try {
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = (errEvent) => {
                logError("convertWebPToPNG: Image load error for WebP conversion.", img.src, errEvent);
                reject(new Error("Image load error for WebP conversion"));
            };
        });
    } catch (error) {
        URL.revokeObjectURL(objectURL);
        return blob;
    }

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        logError("convertWebPToPNG: Failed to get 2D context from canvas.");
        URL.revokeObjectURL(objectURL);
        return blob;
    }
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(objectURL);

    return new Promise((resolve) => {
      canvas.toBlob((pngBlob) => {
        if (pngBlob) {
          logDebug("convertWebPToPNG: Conversion to PNG successful.");
          resolve(pngBlob);
        } else {
          logError("convertWebPToPNG: canvas.toBlob failed, returning original.");
          resolve(blob);
        }
      }, "image/png");
    });
  }

  /**
   * @param imgSrc {string}
   * @param filename_input {string}
   * @returns {Promise<object>}
   */
  async function prepare_download_file(imgSrc, filename_input = "") {
    logDebug(`prepare_download_file: Starting for src: ${imgSrc}, filename_input: ${filename_input}`);
    let effectiveImgSrc = imgSrc;
    if (!effectiveImgSrc || typeof effectiveImgSrc !== 'string') {
        logError(`prepare_download_file: Invalid imgSrc: ${effectiveImgSrc}`);
        await showCustomAlert(`无效的图片链接。`);
        return { ok: false, blob: null, filename: "" };
    }
    if (effectiveImgSrc.startsWith("//")) {
      effectiveImgSrc = `${window.location.protocol}${effectiveImgSrc}`;
    }

    let url;
    try {
        url = new URL(effectiveImgSrc);
    } catch (e) {
        logError(`prepare_download_file: Invalid URL: ${effectiveImgSrc}`, e);
        await showCustomAlert(`链接无效: ${effectiveImgSrc}`);
        return { ok: false, blob: null, filename: "" };
    }

    let response;
    try {
        response = await fetch(effectiveImgSrc);
        logDebug(`prepare_download_file: Fetch response status for ${effectiveImgSrc}: ${response.status}`);
    } catch (fetchError) {
        logError(`prepare_download_file: Fetch error for ${effectiveImgSrc}:`, fetchError);
        await showCustomAlert(`获取文件失败：网络错误或链接无效。\n链接: ${effectiveImgSrc}`);
        return { ok: false, blob: null, filename: "" };
    }

    if (!response.ok) {
      logError(`prepare_download_file: Fetch failed for ${effectiveImgSrc}, status: ${response.status}`);
      await showCustomAlert(`获取文件失败 (HTTP ${response.status})。\n链接: ${effectiveImgSrc}`);
      return { ok: false, blob: null, filename: "" };
    }
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    logDebug(`prepare_download_file: Content-Type: ${contentType}`);
    const isImage = contentType.startsWith("image/");
    const isWebP = contentType.includes("webp");

    let fileExt;
    if (isImage) {
        fileExt = isWebP ? "png" : (contentType.split("/")[1]?.toLowerCase().split('+')[0] || "jpg");
    } else if (contentType.includes("video")) {
        fileExt = contentType.split("/")[1]?.toLowerCase().split('+')[0] || "mp4";
    } else {
        fileExt = "dat";
        logDebug(`prepare_download_file: Unknown content type, defaulting to .dat extension.`);
    }

    let filename = filename_input || url.pathname.split("/").pop() || `download_${Date.now()}`;
    if (filename.includes("?")) filename = filename.split("?")[0]; // Remove query params from filename
    if (filename.endsWith(".image")) {
      filename = filename.slice(0, -".image".length);
    }

    const currentExtMatch = filename.match(/\.([a-zA-Z0-9]+)$/);
    if (currentExtMatch && currentExtMatch[1].toLowerCase() !== fileExt.toLowerCase()) {
        filename = filename.substring(0, filename.length - currentExtMatch[0].length);
    }
    if (!filename.toLowerCase().endsWith("." + fileExt.toLowerCase())) {
        filename += `.${fileExt}`;
    }
    logDebug(`prepare_download_file: Determined filename: ${filename}`);

    const blob = await response.blob();
    let finalBlob = blob;

    if (isImage && isWebP) {
      logDebug(`prepare_download_file: WebP image detected, attempting conversion to PNG.`);
      try {
        finalBlob = await convertWebPToPNG(blob);
      } catch (error) {
        logError("prepare_download_file: WebP to PNG conversion failed.", error);
      }
    }
    // Return finalBlob (which is either original or converted PNG) and the original blob if needed.
    // For zipping, we'll use finalBlob.
    return { blob: finalBlob, filename, isImage, isWebP, originalBlob: blob, fileExt, ok: true };
  }

  /**
   * @param {Blob} blob
   * @param {string} filename
   */
  async function download_blob(blob, filename) {
    logDebug(`download_blob: Triggering download for "${filename}"`, blob);
    const link = document.createElement("a");
    link.style.display = "none";
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    document.body.removeChild(link);
    logDebug(`download_blob: Download initiated for "${filename}".`);
  }

  /**
   * @param source {string}
   * @param filename_input {string}
   * @param fallback_src {string[]}
   * @param {boolean} [isForZip=false] - If true, returns prepared data instead of downloading
   * @returns {Promise<null|{blob: Blob, filename: string}>} Returns data if isForZip, otherwise null
   */
  async function download_file(source, filename_input = "", fallback_src = [], isForZip = false) {
    logDebug(`download_file: Called with source: ${source}, filename: ${filename_input}, fallbacks:`, fallback_src, `isForZip: ${isForZip}`);
    let url_sources = [source, ...fallback_src].filter(
      (x) => typeof x === "string" && x.trim() !== ""
    );
    url_sources = Array.from(new Set(url_sources));
    logDebug(`download_file: Unique URL sources:`, url_sources);

    if (url_sources.length === 0) {
        logError(`download_file: No valid download URLs for "${filename_input || 'file'}".`);
        if (!isForZip) await showCustomAlert(`[dy-dl] 无有效的下载链接提供给 "${filename_input || '文件'}"。`);
        return null;
    }

    for (const url of url_sources) {
      logDebug(`download_file: Attempting to process URL: ${url}`);
      let preparedFile;
      try {
        preparedFile = await prepare_download_file(url, filename_input);
        if (!preparedFile.ok || !preparedFile.blob) {
          logError(`download_file: prepare_download_file failed for ${url}.`);
          continue;
        }
      } catch (error) {
        logError(`download_file: Error during prepare_download_file for ${url}:`, error);
        continue;
      }

      // If for zipping, return the blob and filename
      if (isForZip) {
        logDebug(`download_file: Prepared for ZIP - filename: ${preparedFile.filename}, blob size: ${preparedFile.blob.size}`);
        return { blob: preparedFile.blob, filename: preparedFile.filename };
      }

      // Standard download process
      try {
        await download_blob(preparedFile.blob, preparedFile.filename);
        console.log(`[dy-dl] 下载成功: ${preparedFile.filename}`);
        return null; // Indicate success for non-zip downloads
      } catch (error) {
        logError(`download_file: Failed to download blob "${preparedFile.filename}" from URL ${url}.`, error);
        // Continue to next source if available
      }
    }

    if (!isForZip) {
        logError(`download_file: All download attempts failed for "${filename_input || 'file'}".`);
        await showCustomAlert(`[dy-dl]所有尝试下载 "${filename_input || '文件'}" 都失败，请刷新页面或检查链接后重试。`);
    }
    return null; // Indicate failure if no download succeeded / not for zipping
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach(
        (/** @type {HTMLElement} */ node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return;
          }
          if (node.classList && node.classList.contains("semi-portal")) {
            const tooltipNode = node.querySelector(".semi-tooltip-wrapper");
            if (tooltipNode) {
              setTimeout(() => handleTooltip(tooltipNode), 50);
            }
          }
          if (
            node.parentElement === document.body &&
            node.classList && node.classList.length === 0 &&
            node.querySelector("img") &&
            !node.querySelector("video")
          ) {
            setTimeout(() => handleModal(node), 50);
          }
          if (node.localName === "xg-controls") {
            handleXgControl(node);
          }
        }
      );
    });
  });

  function handleModal(modalNode) {
    logDebug("handleModal: Called with modalNode:", modalNode);
    const img = modalNode.querySelector("img");
    const container = img?.parentElement;

    if (!img || !container) {
        logDebug("handleModal: Image or container not found in modalNode.");
        return;
    }
    if (container.querySelector(".dy-dl-modal-btn")) return;

    const downloadButton = document.createElement("div");
    downloadButton.textContent = "下载图片";
    downloadButton.className = "LV01TNDE dy-dl-modal-btn";
    downloadButton.style.cssText = `
        position: absolute; bottom: 35px; right: 35px; color: #fff;
        font-size: 16px; background-color: rgba(0,0,0,0.6); padding: 8px 15px;
        border-radius: 5px; cursor: pointer; z-index: 1000;
        transition: background-color 0.2s ease;
    `;
    downloadButton.onmouseover = () => downloadButton.style.backgroundColor = 'rgba(0,0,0,0.8)';
    downloadButton.onmouseout = () => downloadButton.style.backgroundColor = 'rgba(0,0,0,0.6)';

    downloadButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      const filename = img.alt || '图片';
      let display_filename = filename;
      if (filename.length > 10) {
        display_filename = filename.substring(0, 10) + "...";
      }
      const confirmed = await showCustomConfirm(`您确定要下载图片 "${display_filename}" 吗？`);
      if (confirmed) {
        download_file(img.src, filename);
      }
    });
    container.appendChild(downloadButton);
  }

  function handleTooltip(tooltipNode) {
    logDebug("handleTooltip: Called with tooltipNode:", tooltipNode);
    const tooltipContent = tooltipNode.querySelector(".semi-tooltip-content");
    if (!tooltipContent) return;
    if (!tooltipContent.textContent.includes("添加到表情") && !tooltipContent.textContent.includes("取消收藏")) return;

    const imgNode = findImage(tooltipNode);
    if (!imgNode || !imgNode.src) return;
    if (tooltipContent.querySelector(".download-button")) return;

    const downloadButton = document.createElement("div");
    downloadButton.textContent = "下载表情";
    downloadButton.className = "LV01TNDE download-button";
    downloadButton.style.padding = "8px 12px";
    downloadButton.style.cursor = "pointer";

    downloadButton.addEventListener("click", async (e) => {
      e.stopPropagation();
      const filename = imgNode.alt || '表情';
      let display_filename = filename;
      if (filename.length > 10) {
        display_filename = filename.substring(0, 10) + "...";
      }
      const confirmed = await showCustomConfirm(`您确定要下载表情 "${display_filename}" 吗？`);
      if (confirmed) {
        download_file(imgNode.src, filename);
      }
    });
    tooltipContent.appendChild(downloadButton);
  }

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log("[dy-dl] 已启动 (v1.0.9 - 含ZIP打包). DEBUG=" + DEBUG);

  function toShortId(bigintStr) {
    try {
      return BigInt(bigintStr).toString(36);
    } catch (error) {
      return bigintStr;
    }
  }

  function build_filename(media) {
    if (!media || !media.authorInfo) {
        return `douyin_media_${Date.now()}`;
    }
    const {
      authorInfo: { nickname = "未知作者" } = {},
      awemeId = Date.now().toString(),
      desc = "",
      textExtra = [],
    } = media;
    const short_id = toShortId(awemeId);
    const tag_list = textExtra.map((x) => x && x.hashtagName).filter(Boolean);
    const tags = tag_list.map((x) => "#" + x).join("_");
    let rawDesc = desc;
    tag_list.forEach((t) => {
      rawDesc = rawDesc.replace(new RegExp(`#${t}\\s*`, "g"), "");
    });
    rawDesc = rawDesc.trim().replace(/[\\/:*?"<>|#\s\n\r]/g, '_').replace(/__+/g, '_');

    let parts = [nickname, short_id];
    if (tags) parts.push(tags);
    if (rawDesc) parts.push(rawDesc);

    let fullFilename = parts.join("_").replace(/__+/g, '_');
    return fullFilename.slice(0, 120);
  }

  const downloader_status = {
    player: null,
    current_media: null,
    downloading: false,
    $btn: null,
    isZipping: false, // Flag for zipping process
  };

  function bind_player_events() {
    const { player } = downloader_status;
    if (!player) return;
    const update = (event) => {
      downloader_status.current_media = player.config?.awemeInfo;
    };
    if (player.config && player.config.awemeInfo) {
        downloader_status.current_media = player.config.awemeInfo;
    }
    player.on("play", update);
    player.on("seeked", update);
    player.on("videoswitch", update);
    player.on("loadstart", update);
  }

  async function start_detect_player_change() {
    while (1) {
      if (window.player && downloader_status.player !== window.player) {
        downloader_status.player = window.player;
        bind_player_events();
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  start_detect_player_change();

  function flag_start_download(isZippingOperation = false) {
    downloader_status.downloading = true;
    downloader_status.isZipping = isZippingOperation;
    logDebug(`flag_start_download: Download flagged as started. isZipping: ${isZippingOperation}`);
    if(downloader_status.$btn) {
        const titleElement = downloader_status.$btn.querySelector('.xgplayer-setting-title');
        if (titleElement) {
            titleElement.textContent = isZippingOperation ? "打包中..." : "下载中...";
        }
    }
    return () => {
      downloader_status.downloading = false;
      downloader_status.isZipping = false;
      logDebug("flag_start_download: Download flagged as finished.");
      if(downloader_status.$btn) {
        const titleElement = downloader_status.$btn.querySelector('.xgplayer-setting-title');
        if (titleElement) titleElement.textContent = "下载";
      }
    };
  }

  function lock_download(download_fn) {
    return async () => {
      logDebug("lock_download: Attempting to acquire lock for download.");
      if (downloader_status.downloading) {
        const message = downloader_status.isZipping ? "[dy-dl] 正在打包ZIP...请稍等" : "[dy-dl] 正在下载中...请稍等";
        logDebug(`lock_download: Download/Zip operation already in progress. Message: ${message}`);
        await showCustomAlert(message);
        return;
      }
      // Pass a callback to download_fn to indicate if it's a zipping operation for flag_start_download
      const out = flag_start_download(false); // Default to false, _download_current_media will manage its own flag if zipping
      try {
        logDebug("lock_download: Lock acquired, executing download function.");
        await download_fn(flag_start_download); // Pass the flagging function
      } catch(e) {
        logError("lock_download: Error during download function execution:", e);
        await showCustomAlert("[dy-dl] 下载过程中发生未知错误。");
      } finally {
        logDebug("lock_download: Releasing lock.");
        // Ensure 'out' is called even if download_fn sets its own flag, to reset general downloading state
        if (!downloader_status.isZipping) { // If not zipping, 'out' handles the reset.
             out();
        } else { // If it was zipping, ensure the general downloading flag is also reset if not already.
            if(downloader_status.downloading){ // Check if it's still true
                downloader_status.downloading = false;
                downloader_status.isZipping = false; // also reset zipping flag
                 if(downloader_status.$btn) {
                    const titleElement = downloader_status.$btn.querySelector('.xgplayer-setting-title');
                    if (titleElement) titleElement.textContent = "下载";
                }
            }
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    };
  }

  function get_video_urls(video_obj) {
    if (video_obj === null || video_obj === undefined) return [];
    const sources = new Set();
    if (video_obj.playApi) sources.add(video_obj.playApi);
    if (Array.isArray(video_obj.playAddr)) {
      video_obj.playAddr.forEach(addr => addr && addr.src && sources.add(addr.src));
    } else if (video_obj.playAddr && video_obj.playAddr.src) {
        sources.add(video_obj.playAddr.src);
    }
    if (video_obj.bitRateList) {
      video_obj.bitRateList.forEach((x) => {
        if (x && x.playApi) sources.add(x.playApi);
      });
    }
    return Array.from(sources);
  }

  const _download_current_media = async (updateDownloadFlagCallback) => {
    logDebug("_download_current_media: Called.");
    if (!downloader_status.current_media) {
        logError("_download_current_media: No current media information available.");
        await showCustomAlert("[dy-dl] 当前无媒体信息，请尝试播放视频或滑动。");
        return;
    }

    const filename_base = build_filename(downloader_status.current_media);
    let display_filename_base = filename_base;
    if (filename_base.length > 10) {
        display_filename_base = filename_base.substring(0, 10) + "...";
    }

    const isAlbum = Array.isArray(downloader_status.current_media.images) && downloader_status.current_media.images.length > 0;

    const confirmMessage = `您确定要下载 "${display_filename_base}" 吗？${isAlbum ? " (这是一个图集)" : ""}`;
    const confirmed = await showCustomConfirm(confirmMessage);
    if (!confirmed) {
      logDebug("_download_current_media: User cancelled download.");
      return;
    }

    // Actual download/zipping starts, manage flags
    let clearDownloadInProgressFlag;

    const { video, images, image: singleImageField } = downloader_status.current_media;

    if (isAlbum) {
        logDebug(`_download_current_media: Processing album with ${images.length} items.`);
        const imageItems = images.filter(item => item && (item.urlList && item.urlList.length > 0) && !item.video);
        const videoItemsInAlbum = images.filter(item => item && item.video); // These are videos presented as part of an 'image' item.

        let downloadedSomething = false;

        if (imageItems.length > 1 && typeof JSZip !== 'undefined') {
            clearDownloadInProgressFlag = updateDownloadFlagCallback(true); // Set zipping to true
            logDebug(`_download_current_media: Zipping ${imageItems.length} images from album.`);
            const zip = new JSZip();
            const filesToZipPromises = [];

            for (let idx = 0; idx < imageItems.length; idx++) {
                const imageItem = imageItems[idx];
                const itemFilenameBase = `${filename_base}_img_${idx + 1}`;
                const mainUrl = imageItem.urlList[0];
                const fallbackUrls = imageItem.urlList.slice(1);

                filesToZipPromises.push(
                    download_file(mainUrl, itemFilenameBase, fallbackUrls, true)
                    .then(prepared => {
                        if (prepared && prepared.blob && prepared.filename) {
                            logDebug(`_download_current_media: Adding to zip: ${prepared.filename}, size: ${prepared.blob.size}`);
                            zip.file(prepared.filename, prepared.blob);
                        } else {
                            logWarn(`_download_current_media: Failed to prepare image ${idx+1} for zipping from album.`);
                        }
                    })
                );
            }

            try {
                await Promise.all(filesToZipPromises);
                if (Object.keys(zip.files).length > 0) {
                    const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: {level: 6} });
                    await download_blob(zipBlob, `${filename_base}_images.zip`);
                    console.log(`[dy-dl] 图集图片已打包为 ${filename_base}_images.zip 下载。`);
                    downloadedSomething = true;
                } else {
                    logWarn("_download_current_media: No images were successfully added to the zip.");
                    if (imageItems.length > 0) await showCustomAlert("[dy-dl] 图集中的图片打包失败，未生成ZIP文件。");
                }
            } catch (zipError) {
                logError("_download_current_media: Error generating or downloading zip:", zipError);
                await showCustomAlert("[dy-dl] 生成或下载ZIP文件失败。");
            } finally {
                 if(clearDownloadInProgressFlag) clearDownloadInProgressFlag();
            }
        } else { // Download images individually if not zipping (e.g., only 1 image, or JSZip unavailable)
            if(clearDownloadInProgressFlag) clearDownloadInProgressFlag(); // Reset if it was set by parent
            clearDownloadInProgressFlag = updateDownloadFlagCallback(false); // Standard download
            for (let idx = 0; idx < imageItems.length; idx++) {
                const imageItem = imageItems[idx];
                const itemFilename = `${filename_base}_img_${idx + 1}`;
                const mainUrl = imageItem.urlList[0];
                const fallbackUrls = imageItem.urlList.slice(1);
                await download_file(mainUrl, itemFilename, fallbackUrls);
                downloadedSomething = true;
                await new Promise(r => setTimeout(r, 200));
            }
             if(clearDownloadInProgressFlag) clearDownloadInProgressFlag();
        }

        // Download videos from album items separately
        if (videoItemsInAlbum.length > 0) {
            clearDownloadInProgressFlag = updateDownloadFlagCallback(false); // Standard download for these
            logDebug(`_download_current_media: Downloading ${videoItemsInAlbum.length} videos from album items separately.`);
            for (let idx = 0; idx < videoItemsInAlbum.length; idx++) {
                const videoItemContainer = videoItemsInAlbum[idx];
                const actualVideoData = videoItemContainer.video; // The video object is nested
                const itemFilename = `${filename_base}_vid_in_album_${idx + 1}`;
                const video_urls = get_video_urls(actualVideoData);
                if (video_urls.length > 0) {
                    await download_file(video_urls[0], itemFilename, video_urls);
                    downloadedSomething = true;
                } else {
                    logWarn(`_download_current_media: No URLs for video in album item ${idx + 1}.`);
                }
                await new Promise(r => setTimeout(r, 200));
            }
            if(clearDownloadInProgressFlag) clearDownloadInProgressFlag();
        }
        if (!downloadedSomething && images.length > 0) {
             await showCustomAlert(`[dy-dl] 图集 "${filename_base}" 中的项目均无法下载。`);
        }

        return; // Album processing finished
    } else {
        // Single media item (not an album, or album processing handled above)
        clearDownloadInProgressFlag = updateDownloadFlagCallback(false); // Standard download
        logDebug("_download_current_media: Processing single media item.");
        const video_urls = get_video_urls(video); // Main video field
        if (video_urls.length !== 0) {
            logDebug("_download_current_media: Downloading video from main 'video' field.");
            await download_file(video_urls[0], filename_base, video_urls);
            if(clearDownloadInProgressFlag) clearDownloadInProgressFlag();
            return;
        }

        const singleImageUrls = singleImageField?.urlList?.filter(Boolean); // Main image field (e.g. for single image posts)
        if(singleImageUrls && singleImageUrls.length > 0){
            logDebug("_download_current_media: Downloading single image from main 'image' field.");
            await download_file(singleImageUrls[0], filename_base, singleImageUrls);
            if(clearDownloadInProgressFlag) clearDownloadInProgressFlag();
            return;
        }
        if(clearDownloadInProgressFlag) clearDownloadInProgressFlag(); // Ensure flag is cleared
        logError(`_download_current_media: Could not find downloadable content for "${filename_base}".`);
        await showCustomAlert(`[dy-dl]无法下载当前媒体 "${filename_base}"。`);
    }
  };
  const download_current_media = lock_download(_download_current_media);

  function handleXgControl(xg_control_node) {
    if (xg_control_node.querySelector(".dy-dl-xg-btn")) return;

    const right_grid = xg_control_node.querySelector(".xg-right-grid");
    if (!right_grid) {
        logError("handleXgControl: '.xg-right-grid' not found in xg-controls.");
        return;
    }

    const downloadButtonContainer = render_html(`
      <xg-icon class="xgplayer-autoplay-setting automatic-continuous dy-dl-xg-btn" data-state="normal" data-index="9" style="cursor:pointer; order: -1;">
        <div class="xgplayer-icon" data-e2e="dy-dl-video-player-download">
          <div class="xgplayer-setting-label" style="display: flex; align-items: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 5px;">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span class="xgplayer-setting-title">下载</span>
          </div>
        </div>
        <div class="xgTips"><span>保存到本地</span><span class="shortcutKey">M</span></div>
      </xg-icon>
    `);
    downloadButtonContainer.addEventListener("click", (e) => {
        e.stopPropagation();
        download_current_media();
    });

    right_grid.appendChild(downloadButtonContainer);
    downloader_status.$btn = downloadButtonContainer;
  }

  function addHotkeyHook(key, fn) {
    document.addEventListener("keydown", (ev) => {
      if (ev.key.toLowerCase() !== key) return;
      const activeElement = document.activeElement;
      const isInputElement =
        activeElement && (
        activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable);
      if (isInputElement) return;
      ev.preventDefault();
      fn();
    });
  }
  addHotkeyHook("m", download_current_media);

})();

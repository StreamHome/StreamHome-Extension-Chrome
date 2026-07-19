console.log("[DEBUG] StreamHome Persistent Sniffer Service Worker Started.");

const BLACKLIST_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.ico',
  '.css', '.js', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.js.map', '.css.map'
];

const BLACKLISTED_MIMES = [
  'text/css', 'application/javascript', 'application/x-javascript',
  'image/', 'font/', 'application/json', 'text/html', 'text/plain', 'application/xml'
];

// Helper to extract resolution numbers
function getResolution(lowerUrl) {
  if (lowerUrl.includes('1080') || lowerUrl.includes('fhd') || lowerUrl.includes('1080p')) return '1080';
  if (lowerUrl.includes('720') || lowerUrl.includes('hd') || lowerUrl.includes('720p')) return '720';
  if (lowerUrl.includes('480') || lowerUrl.includes('480p')) return '480';
  if (lowerUrl.includes('360') || lowerUrl.includes('360p')) return '360';
  return 'Unknown';
}

function parseHlsManifest(text) {
  const resolutions = new Set();
  const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const height = parseInt(match[2], 10);
    if (height) resolutions.add(`${height}p`);
  }
  return Array.from(resolutions).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
}

function parseDashManifest(text) {
  const resolutions = new Set();
  const regex = /<Representation[^>]*width="(\d+)"[^>]*height="(\d+)"/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const height = parseInt(match[2], 10);
    if (height) resolutions.add(`${height}p`);
  }
  return Array.from(resolutions).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
}

async function detectManifestQualities(url, type, extractedHeaders) {
  try {
    const fetchHeaders = { 'X-StreamHome-Sniffer': 'true' };
    if (extractedHeaders.referer) fetchHeaders['Referer'] = extractedHeaders.referer;
    if (extractedHeaders.origin) fetchHeaders['Origin'] = extractedHeaders.origin;
    if (extractedHeaders['user-agent']) fetchHeaders['User-Agent'] = extractedHeaders['user-agent'];
    if (extractedHeaders.cookie) fetchHeaders['Cookie'] = extractedHeaders.cookie;
    if (extractedHeaders.authorization) fetchHeaders['Authorization'] = extractedHeaders.authorization;

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: fetchHeaders,
      signal: controller.signal
    });
    clearTimeout(id);

    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
    const text = await response.text();

    let qualities = [];
    if (type === 'm3u8') {
      qualities = parseHlsManifest(text);
    } else if (type === 'mpd') {
      qualities = parseDashManifest(text);
    }

    if (qualities && qualities.length > 0) {
      console.log(`[DEBUG] Successfully parsed real qualities from manifest for ${url}:`, qualities);
      return qualities;
    }
  } catch (e) {
    console.error(`[DEBUG] Manifest fetch/parse failed for ${url}:`, e);
  }
  return null;
}

// =========================================================================
// STORAGE WRITE SERIALIZATION QUEUE
// =========================================================================
let storageQueue = Promise.resolve();
function runInQueue(taskFn) {
  storageQueue = storageQueue.then(() => new Promise((resolve) => {
    taskFn(resolve);
  }));
}

// =========================================================================
// CLEAN-ROOM VIDEO SNIFFER ENGINE
// =========================================================================

// Temporary storage fallback if storage.session is unavailable
const activeRequestHeaders = new Map();

// Helper to filter out expired request headers (older than 5 minutes) to prevent leaks
async function cleanExpiredHeaders() {
  const now = Date.now();
  if (chrome.storage && chrome.storage.session) {
    try {
      const all = await chrome.storage.session.get(null);
      const keysToRemove = [];
      for (const [key, val] of Object.entries(all)) {
        if (val && now - val.timestamp > 300000) { // 5 minutes
          keysToRemove.push(key);
        }
      }
      if (keysToRemove.length > 0) {
        await chrome.storage.session.remove(keysToRemove);
      }
    } catch (e) {
      console.error("[DEBUG] Error cleaning session storage:", e);
    }
  } else {
    for (const [requestId, data] of activeRequestHeaders.entries()) {
      if (now - data.timestamp > 300000) {
        activeRequestHeaders.delete(requestId);
      }
    }
  }
}
setInterval(cleanExpiredHeaders, 60000);

if (typeof chrome !== 'undefined' && chrome.webRequest) {
  // 1. Capture outgoing request headers
  const sendHeadersSpec = ["requestHeaders"];
  try {
    sendHeadersSpec.push("extraHeaders");
  } catch (e) {}

  chrome.webRequest.onSendHeaders.addListener(
    async (details) => {
      if (details.requestHeaders) {
        const isInternal = details.requestHeaders.some(h => h.name.toLowerCase() === 'x-streamhome-sniffer');
        if (isInternal) return;

        if (chrome.storage && chrome.storage.session) {
          try {
            await chrome.storage.session.set({
              [details.requestId]: {
                timestamp: Date.now(),
                headers: details.requestHeaders
              }
            });
          } catch (e) {
            console.error("[DEBUG] Session storage set error:", e);
          }
        } else {
          activeRequestHeaders.set(details.requestId, {
            timestamp: Date.now(),
            headers: details.requestHeaders
          });
        }
      }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
    sendHeadersSpec
  );

  // 2. Sniff responses on completion
  const extraInfoSpec = ["responseHeaders"];
  try {
    extraInfoSpec.push("extraHeaders");
  } catch (e) {}

  chrome.webRequest.onResponseStarted.addListener(
    async (details) => {
      if (details.method === 'OPTIONS') return;
      if (details.statusCode < 200 || details.statusCode > 299) return;
      if (!details.url || !details.url.startsWith("http")) return;

      const urlObj = new URL(details.url);
      if (urlObj.pathname.match(/\.ts$|\.m4s$|\.m2ts$|chunk|seg-|fragment|part\d+|init/i)) {
        return;
      }

      const cleanPath = urlObj.pathname.toLowerCase().split('?')[0];
      if (BLACKLIST_EXTENSIONS.some(ext => cleanPath.endsWith(ext))) {
        return;
      }

      // Asynchronously retrieve request headers
      let requestHeaders = null;
      if (chrome.storage && chrome.storage.session) {
        try {
          const res = await chrome.storage.session.get(details.requestId);
          const savedRequest = res[details.requestId];
          if (savedRequest) {
            requestHeaders = savedRequest.headers;
            await chrome.storage.session.remove(details.requestId);
          }
        } catch (e) {
          console.error("[DEBUG] Session storage get error:", e);
        }
      } else {
        const savedRequest = activeRequestHeaders.get(details.requestId);
        if (savedRequest) {
          requestHeaders = savedRequest.headers;
          activeRequestHeaders.delete(details.requestId);
        }
      }

      const responseHeaders = {};
      if (details.responseHeaders) {
        details.responseHeaders.forEach(h => {
          if (h.name && h.value) {
            responseHeaders[h.name.toLowerCase()] = h.value.toLowerCase();
          }
        });
      }

      const contentType = responseHeaders['content-type'] || '';

      if (BLACKLISTED_MIMES.some(mime => contentType.includes(mime))) {
        return;
      }

      const contentLengthHeader = responseHeaders['content-length'];
      const contentRangeHeader = responseHeaders['content-range'];

      let contentLength = 0;
      if (contentRangeHeader) {
        const parts = contentRangeHeader.split('/');
        if (parts[1]) contentLength = parseInt(parts[1], 10);
      } else if (contentLengthHeader) {
        contentLength = parseInt(contentLengthHeader, 10);
      }

      const isHlsMime = contentType.includes('mpegurl') || contentType.includes('x-mpegurl') || contentType.includes('apple.mpegurl');
      const isHlsExt = cleanPath.endsWith('.m3u8') || cleanPath.endsWith('.m3u') || details.url.includes('/api/playlist/master/') || details.url.includes('/master.txt');
      const isDashMime = contentType.includes('dash+xml');
      const isDashExt = cleanPath.endsWith('.mpd');

      if (isHlsMime || isHlsExt) {
        processAndStoreStream(details.url, 'm3u8', requestHeaders, details.tabId);
        return;
      }

      if (isDashMime || isDashExt) {
        processAndStoreStream(details.url, 'mpd', requestHeaders, details.tabId);
        return;
      }

      const videoExtensions = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.wmv', '.mpg', '.mpeg', '.m4v', '.3gp'];
      const audioExtensions = ['.mp3', '.aac', '.ogg', '.wav', '.flac', '.m4a'];
      const subtitleExtensions = ['.vtt', '.srt'];
      const isVideoExt = videoExtensions.some(ext => cleanPath.endsWith(ext));
      const isAudioExt = audioExtensions.some(ext => cleanPath.endsWith(ext));
      const isSubtitleExt = subtitleExtensions.some(ext => cleanPath.endsWith(ext));
      const isSubtitleMime = contentType.includes('vtt');

      const isMediaMime = contentType.startsWith('video/') || contentType.startsWith('audio/');
      const isMediaDetailType = details.type === 'media';

      const hasValidMediaMime = isMediaMime || isHlsMime || isDashMime || isSubtitleMime;
      const hasValidMediaExt = isVideoExt || isAudioExt || isHlsExt || isDashExt || isSubtitleExt;

      if (isMediaDetailType && !hasValidMediaMime && !hasValidMediaExt) {
        return;
      }

      if (isSubtitleExt || isSubtitleMime) {
        processAndStoreStream(details.url, 'subtitle', requestHeaders, details.tabId);
        return;
      }

      if (isMediaMime || isMediaDetailType || isVideoExt || isAudioExt) {
        if (contentLength && contentLength < 500000) {
          return;
        }
        processAndStoreStream(details.url, 'video', requestHeaders, details.tabId);
      }
    },
    { urls: ["<all_urls>"], types: ["xmlhttprequest", "media", "other"] },
    extraInfoSpec
  );
}

function extractKeyHeaders(requestHeaders) {
  const result = {};
  if (!requestHeaders) return result;
  
  const targetHeaders = ['cookie', 'referer', 'user-agent', 'origin', 'authorization'];
  requestHeaders.forEach(h => {
    const nameLower = h.name.toLowerCase();
    if (targetHeaders.includes(nameLower)) {
      result[nameLower] = h.value;
    }
  });
  return result;
}

function getStreamSignature(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace('www.', '');
    const extMatch = parsed.pathname.match(/\.(m3u8|mpd|mp4|mkv|webm|m4a|mp3|aac|ogg|wav|flac)$/i);
    const ext = extMatch ? extMatch[1].toLowerCase() : '';
    return ext ? `${host}|.${ext}` : host;
  } catch (e) {
    return null;
  }
}

function processAndStoreStream(url, type = 'video', requestHeaders = null, sourceTabId = -1) {
  if (url.includes('chrome-extension://')) return;

  chrome.storage.local.get(['activeTaskId', 'activeTabId'], (preCheck) => {
    if (!preCheck.activeTaskId) return;
    if (preCheck.activeTabId && sourceTabId !== -1 && sourceTabId !== preCheck.activeTabId) return;

    const extractedHeaders = extractKeyHeaders(requestHeaders);
    const qualityPromise = (type === 'm3u8' || type === 'mpd')
      ? detectManifestQualities(url, type, extractedHeaders)
      : Promise.resolve(null);

    qualityPromise.then((detectedQualities) => {
      runInQueue((next) => {
        chrome.storage.local.get(['scanned_tasks', 'learned_patterns'], (result) => {
          // Re-verify in case it was turned off during the fetch
          chrome.storage.local.get(['activeTaskId', 'activeTabId'], (postCheck) => {
            const activeTaskId = postCheck.activeTaskId;
            const activeTabId = postCheck.activeTabId;
            const tasks = result.scanned_tasks || [];
            const patterns = result.learned_patterns || { video_patterns: [], audio_patterns: [], favorite_patterns: [] };

            if (!activeTaskId) {
              next();
              return;
            }

            // Verify Tab Scope: Ignore streams from other tabs (allow -1 for Service Workers)
            if (activeTabId && sourceTabId !== -1 && sourceTabId !== activeTabId) {
          next();
          return;
        }

        const taskIndex = tasks.findIndex(t => t.id == activeTaskId);
        if (taskIndex === -1) {
          next();
          return;
        }

        const task = tasks[taskIndex];
        task.rawStreams = task.rawStreams || [];
        task.capturedHeaders = task.capturedHeaders || {};
        task.streamQualities = task.streamQualities || {};

        task.capturedHeaders[url] = extractedHeaders;

        // Save detected qualities
        if (detectedQualities && detectedQualities.length > 0) {
          task.streamQualities[url] = detectedQualities;
        } else {
          if (!task.streamQualities[url]) {
            let fallbackRes = getResolution(url);
            if (fallbackRes === 'Unknown') {
              fallbackRes = type === 'm3u8' ? 'HLS' : type === 'mpd' ? 'DASH' : 'Unknown';
            } else {
              fallbackRes = fallbackRes + 'p';
            }
            task.streamQualities[url] = [fallbackRes];
          }
        }

        let currentEpStreamsCount = 0;
        let isNewStream = false;
        let targetData = null;
        
        if (task.type === 'series') {
          const season = task.activeSeason || 1;
          const episode = task.activeEpisode || 1;
          const epKey = `${season}x${episode}`;
          task.episodes = task.episodes || {};

          // Prevent cross-episode stream bleeding (e.g., user switched seasons in popup but browser is still on old episode)
          let alreadyExistsInOtherEpisode = false;
          for (const key in task.episodes) {
            if (key !== epKey && task.episodes[key].rawStreams && task.episodes[key].rawStreams.includes(url)) {
              alreadyExistsInOtherEpisode = true;
              break;
            }
          }
          if (alreadyExistsInOtherEpisode) {
            next();
            return;
          }

          task.episodes[epKey] = task.episodes[epKey] || {
            rawStreams: [],
            favorites: [],
            taggedVideoUrl: null,
            taggedAudioUrl: null
          };
          const epData = task.episodes[epKey];
          epData.rawStreams = epData.rawStreams || [];
          epData.favorites = epData.favorites || [];
          
          if (!epData.rawStreams.includes(url)) {
            epData.rawStreams.push(url);
            isNewStream = true;
          }
          currentEpStreamsCount = epData.rawStreams.length;
          task.status = `S${season}E${episode} Discovered ${currentEpStreamsCount} Streams`;
          targetData = epData;
        } else {
          task.favorites = task.favorites || [];
          if (!task.rawStreams.includes(url)) {
            task.rawStreams.push(url);
            isNewStream = true;
          }
          task.status = `Discovered ${task.rawStreams.length} Streams`;
          targetData = task;
        }

        if (!isNewStream) {
          chrome.storage.local.set({ scanned_tasks: tasks }, () => {
            next();
          });
          return;
        }

        // Auto-tagging logic
        const sig = getStreamSignature(url);
        if (sig && type !== 'subtitle') {
           if (patterns.video_patterns.includes(sig) && !targetData.taggedVideoUrl) {
              targetData.taggedVideoUrl = url;
           }
           if (patterns.audio_patterns.includes(sig) && !targetData.taggedAudioUrl) {
              targetData.taggedAudioUrl = url;
           }
        }

        chrome.storage.local.set({ scanned_tasks: tasks }, () => {
          const badgeVal = task.type === 'series' ? currentEpStreamsCount : task.rawStreams.length;
          chrome.action.setBadgeText({ text: badgeVal.toString() });
          chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });

          // Trigger premium Chrome desktop notification
          try {
            const list = task.streamQualities[url] || [];
            const resLabel = list[0] || 'Unknown';
            const typeLabel = type === 'm3u8' ? 'HLS' : type === 'mpd' ? 'DASH' : type === 'subtitle' ? 'Subtitle' : 'Video';
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon.jpg',
              title: `New Stream Discovered (${resLabel} ${typeLabel})`,
              message: `Found source for "${task.title}". Click to configure.`,
              priority: 1
            });
          } catch (err) {
            console.error("[DEBUG] Error sending notification:", err);
          }

          next();
        });
      }); // closes postCheck
    }); // closes result
  }); // closes runInQueue
}); // closes qualityPromise.then
}); // closes preCheck
}

// =========================================================================
// DECLARATIVE NET REQUEST DYNAMIC BYPASS RULES
// =========================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'set_bypass_rules') {
    const { targetUrl, headers } = message;
    if (!targetUrl) return;

    try {
      const urlObj = new URL(targetUrl);
      const host = urlObj.host;
      
      const requestHeaders = [];
      if (headers.referer) {
        requestHeaders.push({ header: 'referer', operation: 'set', value: headers.referer });
      }
      if (headers.origin) {
        requestHeaders.push({ header: 'origin', operation: 'set', value: headers.origin });
      }
      if (headers['user-agent']) {
        requestHeaders.push({ header: 'user-agent', operation: 'set', value: headers['user-agent'] });
      }

      const rule = {
        id: 1001,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          requestHeaders: requestHeaders
        },
        condition: {
          urlFilter: `*://${host}/*`,
          resourceTypes: ['xmlhttprequest', 'media']
        }
      };

      chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [1001],
        addRules: [rule]
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("[DEBUG] DNR Session Rules Registration Failed:", chrome.runtime.lastError);
        } else {
          console.log("[DEBUG] Successfully registered DNR Referer bypass rules for host:", host);
        }
      });
    } catch (e) {
      console.error("[DEBUG] Failed to setup DNR rules due to URL parsing error:", e);
    }
  } else if (message.action === 'clear_bypass_rules') {
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1001]
    }, () => {
      console.log("[DEBUG] Cleared active DNR Referer bypass rules (Rule 1001).");
    });
  } else if (message.action === 'update_stream_quality') {
    const { url, resolution } = message;
    if (!url || !resolution) return;

    runInQueue((next) => {
      chrome.storage.local.get(['scanned_tasks'], (result) => {
        const tasks = result.scanned_tasks || [];
        let updated = false;

        tasks.forEach(task => {
          if (task.rawStreams && task.rawStreams.includes(url)) {
            task.streamQualities = task.streamQualities || {};
            task.streamQualities[url] = [resolution];
            updated = true;
          }
        });

        if (updated) {
          chrome.storage.local.set({ scanned_tasks: tasks }, () => {
            console.log(`[DEBUG] Updated stream quality from player metadata for ${url}: ${resolution}`);
            next();
          });
        } else {
          next();
        }
      });
    });
  }
});
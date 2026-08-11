import './stream-learning.js';

console.log("[DEBUG] StreamHome Persistent Sniffer Service Worker Started.");

const BLACKLIST_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.bmp', '.ico',
  '.css', '.js', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.js.map', '.css.map'
];

const BLACKLISTED_MIMES = [
  'text/css', 'application/javascript', 'application/x-javascript',
  'image/', 'font/', 'application/json', 'text/html', 'text/plain', 'application/xml'
];

const SUBTITLE_SAMPLE_MAX_BYTES = 128 * 1024;
const SUBTITLE_SAMPLE_RULE_ID_BASE = 1500000000;
let subtitleSampleRuleOffset = 0;

function buildCapturedFetchHeaders(extractedHeaders = {}, includeRange = false) {
  const fetchHeaders = { 'X-StreamHome-Sniffer': 'true' };
  if (extractedHeaders.referer) fetchHeaders.Referer = extractedHeaders.referer;
  if (extractedHeaders.origin) fetchHeaders.Origin = extractedHeaders.origin;
  if (extractedHeaders['user-agent']) fetchHeaders['User-Agent'] = extractedHeaders['user-agent'];
  if (extractedHeaders.cookie) fetchHeaders.Cookie = extractedHeaders.cookie;
  if (extractedHeaders.authorization) fetchHeaders.Authorization = extractedHeaders.authorization;
  if (includeRange) fetchHeaders.Range = `bytes=0-${SUBTITLE_SAMPLE_MAX_BYTES - 1}`;
  return fetchHeaders;
}

function buildSubtitleSampleFetchHeaders(extractedHeaders = {}, includeRange = false) {
  const fetchHeaders = { 'X-StreamHome-Sniffer': 'true' };
  if (extractedHeaders.authorization) fetchHeaders.Authorization = extractedHeaders.authorization;
  if (includeRange) fetchHeaders.Range = `bytes=0-${SUBTITLE_SAMPLE_MAX_BYTES - 1}`;
  return fetchHeaders;
}

function getNextSubtitleSampleRuleId() {
  subtitleSampleRuleOffset = (subtitleSampleRuleOffset + 1) % 100000000;
  return SUBTITLE_SAMPLE_RULE_ID_BASE + subtitleSampleRuleOffset;
}

function escapeDnrRegex(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

async function installSubtitleSampleRule(parsedUrl, extractedHeaders = {}) {
  if (!chrome.declarativeNetRequest || typeof chrome.declarativeNetRequest.updateSessionRules !== 'function') {
    return null;
  }

  const requestHeaders = [];
  const supportedHeaders = ['referer', 'origin', 'user-agent', 'cookie', 'authorization'];
  supportedHeaders.forEach((header) => {
    const value = extractedHeaders[header];
    if (typeof value === 'string' && value) {
      requestHeaders.push({ header, operation: 'set', value });
    }
  });
  if (requestHeaders.length === 0) return null;

  const ruleId = getNextSubtitleSampleRuleId();
  const exactUrlRegex = `^${escapeDnrRegex(parsedUrl.href)}$`;
  const condition = exactUrlRegex.length <= 1900
    ? {
        regexFilter: exactUrlRegex,
        isUrlFilterCaseSensitive: true,
        resourceTypes: ['xmlhttprequest'],
        tabIds: [chrome.tabs.TAB_ID_NONE]
      }
    : {
        urlFilter: `||${parsedUrl.host}/`,
        resourceTypes: ['xmlhttprequest'],
        tabIds: [chrome.tabs.TAB_ID_NONE]
      };

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [{
        id: ruleId,
        priority: 100,
        action: {
          type: 'modifyHeaders',
          requestHeaders
        },
        condition
      }]
    });
    return ruleId;
  } catch (error) {
    return null;
  }
}

async function removeSubtitleSampleRule(ruleId) {
  if (!ruleId) return;
  try {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
  } catch (error) {
    // The fetch has already finished; a later rule ID reuse also removes stale rules.
  }
}

async function readTextSample(response, maxBytes = SUBTITLE_SAMPLE_MAX_BYTES) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    return (await response.text()).slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (totalBytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      const remaining = maxBytes - totalBytes;
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      totalBytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: totalBytes < maxBytes });

      if (value.byteLength > remaining) {
        await reader.cancel();
        break;
      }
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function fetchSubtitleSample(url, extractedHeaders = {}) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return { ok: false, reason: 'invalid-url' };
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { ok: false, reason: 'unsupported-url' };
  }
  parsedUrl.hash = '';

  const ruleId = await installSubtitleSampleRule(parsedUrl, extractedHeaders);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    let failureReason = 'fetch-failed';
    for (const includeRange of [true, false]) {
      if (controller.signal.aborted) return { ok: false, reason: 'timeout' };

      try {
        const response = await fetch(parsedUrl.href, {
          credentials: 'include',
          headers: buildSubtitleSampleFetchHeaders(extractedHeaders, includeRange),
          signal: controller.signal
        });
        if (!response.ok) {
          failureReason = `http-${response.status}`;
          if (response.body) await response.body.cancel();
          continue;
        }

        const text = await readTextSample(response);
        if (text.trim()) return { ok: true, text };
        failureReason = 'empty';
      } catch (error) {
        if (error && error.name === 'AbortError') return { ok: false, reason: 'timeout' };
        failureReason = 'fetch-failed';
      }
    }
    return { ok: false, reason: failureReason };
  } finally {
    clearTimeout(timeoutId);
    await removeSubtitleSampleRule(ruleId);
  }
}

// Helper to extract resolution numbers
function getResolution(lowerUrl) {
  if (lowerUrl.includes('1080') || lowerUrl.includes('fhd') || lowerUrl.includes('1080p')) return '1080';
  if (lowerUrl.includes('720') || lowerUrl.includes('hd') || lowerUrl.includes('720p')) return '720';
  if (lowerUrl.includes('480') || lowerUrl.includes('480p')) return '480';
  if (lowerUrl.includes('360') || lowerUrl.includes('360p')) return '360';
  return 'Unknown';
}

function parseManifestAttributeList(value) {
  const attributes = {};
  let token = '';
  let quoted = false;
  const parts = [];

  for (const char of String(value || '')) {
    if (char === '"') quoted = !quoted;
    if (char === ',' && !quoted) {
      parts.push(token);
      token = '';
    } else {
      token += char;
    }
  }
  if (token) parts.push(token);

  parts.forEach((part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return;
    const key = part.slice(0, separator).trim().toUpperCase();
    let attributeValue = part.slice(separator + 1).trim();
    if (attributeValue.startsWith('"') && attributeValue.endsWith('"')) {
      attributeValue = attributeValue.slice(1, -1);
    }
    if (key) attributes[key] = attributeValue;
  });
  return attributes;
}

function resolveManifestUrl(value, manifestUrl) {
  if (!value) return '';
  try {
    return new URL(value, manifestUrl).href;
  } catch (_) {
    return '';
  }
}

function normalizeManifestLanguage(value) {
  const normalized = String(value || '').trim().replace(/_/g, '-').toLowerCase();
  return normalized || 'unknown';
}

function parseHlsManifest(text, manifestUrl) {
  const resolutions = new Set();
  const regex = /#EXT-X-STREAM-INF:.*RESOLUTION=(\d+)x(\d+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const height = parseInt(match[2], 10);
    if (height) resolutions.add(`${height}p`);
  }

  const audioTracks = [];
  String(text || '').split(/\r?\n/).forEach((line) => {
    const normalizedLine = line.trim();
    if (!normalizedLine.startsWith('#EXT-X-MEDIA:')) return;
    const attributes = parseManifestAttributeList(normalizedLine.slice('#EXT-X-MEDIA:'.length));
    if (String(attributes.TYPE || '').toUpperCase() !== 'AUDIO') return;

    const audioUrl = resolveManifestUrl(attributes.URI, manifestUrl);
    const language = normalizeManifestLanguage(attributes.LANGUAGE || attributes['ASSOC-LANGUAGE']);
    const name = String(attributes.NAME || '').trim() || (language === 'unknown' ? 'Audio track' : language.toUpperCase());
    const groupId = String(attributes['GROUP-ID'] || '').trim();
    audioTracks.push({
      id: `hls:${audioUrl || manifestUrl}:${groupId}:${language}:${name}`,
      url: audioUrl,
      language,
      name,
      groupId,
      sourceType: 'hls',
      manifestUrl,
      isDefault: String(attributes.DEFAULT || '').toUpperCase() === 'YES',
      autoSelect: String(attributes.AUTOSELECT || '').toUpperCase() === 'YES',
      deployable: Boolean(audioUrl)
    });
  });

  return {
    qualities: Array.from(resolutions).sort((a, b) => parseInt(b, 10) - parseInt(a, 10)),
    audioTracks
  };
}

function getXmlAttributes(value) {
  const attributes = {};
  const regex = /([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = regex.exec(String(value || ''))) !== null) {
    attributes[match[1].toLowerCase()] = match[3];
  }
  return attributes;
}

function parseDashManifest(text, manifestUrl) {
  const resolutions = new Set();
  const regex = /<Representation[^>]*width="(\d+)"[^>]*height="(\d+)"/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const height = parseInt(match[2], 10);
    if (height) resolutions.add(`${height}p`);
  }

  const audioTracks = [];
  const adaptationRegex = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
  while ((match = adaptationRegex.exec(String(text || ''))) !== null) {
    const adaptationAttributes = getXmlAttributes(match[1]);
    const body = match[2];
    const representationMatch = body.match(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>|<Representation\b([^>]*)\/>/i);
    const representationAttributes = getXmlAttributes(representationMatch ? (representationMatch[1] || representationMatch[3] || '') : '');
    const mimeType = adaptationAttributes.mimetype || representationAttributes.mimetype || '';
    const contentType = adaptationAttributes.contenttype || '';
    if (contentType.toLowerCase() !== 'audio' && !mimeType.toLowerCase().startsWith('audio/')) continue;

    const representationBody = representationMatch ? (representationMatch[2] || '') : '';
    const baseUrlMatch = representationBody.match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i)
      || body.match(/<BaseURL[^>]*>([^<]+)<\/BaseURL>/i);
    const resolvedUrl = baseUrlMatch ? resolveManifestUrl(baseUrlMatch[1].trim(), manifestUrl) : '';
    const deployable = /\.(m3u8?|mp3|aac|ogg|wav|flac|m4a)(?:$|[?#])/i.test(resolvedUrl);
    const language = normalizeManifestLanguage(adaptationAttributes.lang || representationAttributes.lang);
    const adaptationId = adaptationAttributes.id || '';
    const representationId = representationAttributes.id || '';
    audioTracks.push({
      id: `dash:${manifestUrl}:${adaptationId}:${representationId}:${language}`,
      url: deployable ? resolvedUrl : '',
      language,
      name: language === 'unknown' ? 'DASH audio track' : language.toUpperCase(),
      groupId: adaptationId,
      representationId,
      sourceType: 'dash',
      manifestUrl,
      isDefault: false,
      autoSelect: false,
      deployable
    });
  }

  return {
    qualities: Array.from(resolutions).sort((a, b) => parseInt(b, 10) - parseInt(a, 10)),
    audioTracks
  };
}

async function inspectManifest(url, type, extractedHeaders) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: buildCapturedFetchHeaders(extractedHeaders),
      signal: controller.signal
    });
    clearTimeout(id);

    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
    const text = await response.text();

    let metadata = { qualities: [], audioTracks: [] };
    if (type === 'm3u8') {
      metadata = parseHlsManifest(text, url);
    } else if (type === 'mpd') {
      metadata = parseDashManifest(text, url);
    }

    if (metadata.qualities.length > 0 || metadata.audioTracks.length > 0) {
      console.log(`[DEBUG] Successfully parsed manifest metadata for ${url}:`, metadata);
    }
    return metadata;
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
  }

  for (const [requestId, data] of activeRequestHeaders.entries()) {
    if (now - data.timestamp > 300000) {
      activeRequestHeaders.delete(requestId);
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
        const requestRecord = {
          timestamp: Date.now(),
          headers: isInternal ? [] : details.requestHeaders,
          internal: isInternal
        };

        // Keep an immediate in-memory marker so a fast internal response cannot
        // race the asynchronous session-storage write.
        if (isInternal) {
          activeRequestHeaders.set(details.requestId, requestRecord);
        }

        if (chrome.storage && chrome.storage.session) {
          try {
            await chrome.storage.session.set({
              [details.requestId]: requestRecord
            });
            if (isInternal && !activeRequestHeaders.has(details.requestId)) {
              await chrome.storage.session.remove(details.requestId);
            }
          } catch (e) {
            console.error("[DEBUG] Session storage set error:", e);
          }
        } else {
          activeRequestHeaders.set(details.requestId, requestRecord);
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
      let isInternalRequest = false;
      const memoryRequest = activeRequestHeaders.get(details.requestId);
      if (memoryRequest) {
        requestHeaders = memoryRequest.headers;
        isInternalRequest = memoryRequest.internal === true;
        activeRequestHeaders.delete(details.requestId);
      }

      if (chrome.storage && chrome.storage.session) {
        try {
          const res = await chrome.storage.session.get(details.requestId);
          const savedRequest = res[details.requestId];
          if (savedRequest) {
            requestHeaders = savedRequest.headers;
            isInternalRequest = isInternalRequest || savedRequest.internal === true;
            await chrome.storage.session.remove(details.requestId);
          }
        } catch (e) {
          console.error("[DEBUG] Session storage get error:", e);
        }
      }

      if (isInternalRequest) return;

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

function processAndStoreStream(url, type = 'video', requestHeaders = null, sourceTabId = -1) {
  if (url.includes('chrome-extension://')) return;

  chrome.storage.local.get(['activeTaskId', 'activeTabId'], (preCheck) => {
    if (!preCheck.activeTaskId) return;
    if (preCheck.activeTabId && sourceTabId !== -1 && sourceTabId !== preCheck.activeTabId) return;

    const extractedHeaders = extractKeyHeaders(requestHeaders);
    const manifestPromise = (type === 'm3u8' || type === 'mpd')
      ? inspectManifest(url, type, extractedHeaders)
      : Promise.resolve(null);

    manifestPromise.then((manifestMetadata) => {
      runInQueue((next) => {
        chrome.storage.local.get(['scanned_tasks', 'learned_patterns'], (result) => {
          // Re-verify in case it was turned off during the fetch
          chrome.storage.local.get(['activeTaskId', 'activeTabId'], (postCheck) => {
            const activeTaskId = postCheck.activeTaskId;
            const activeTabId = postCheck.activeTabId;
            const tasks = result.scanned_tasks || [];
            const patterns = StreamLearning.migratePatterns(result.learned_patterns, tasks);

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
        task.streamSourceTypes = task.streamSourceTypes || {};

        task.capturedHeaders[url] = extractedHeaders;
        task.streamSourceTypes[url] = type;

        const detectedQualities = manifestMetadata && Array.isArray(manifestMetadata.qualities)
          ? manifestMetadata.qualities
          : [];
        const detectedAudioTracks = manifestMetadata && Array.isArray(manifestMetadata.audioTracks)
          ? manifestMetadata.audioTracks
          : [];

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
          epData.manifestAudioTracks = epData.manifestAudioTracks || {};
          
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

        targetData.manifestAudioTracks = targetData.manifestAudioTracks || {};
        if ((type === 'm3u8' || type === 'mpd') && manifestMetadata) {
          targetData.manifestAudioTracks[url] = detectedAudioTracks;
          detectedAudioTracks.forEach((track) => {
            if (track && track.url && !task.capturedHeaders[track.url]) {
              task.capturedHeaders[track.url] = extractedHeaders;
            }
          });
        }

        if (!isNewStream) {
          chrome.storage.local.set({ scanned_tasks: tasks }, () => {
            next();
          });
          return;
        }

        // Auto-tagging logic
        if (type !== 'subtitle') {
           if (StreamLearning.getRecommendation(url, patterns, 'video').recommended && !targetData.taggedVideoUrl) {
              targetData.taggedVideoUrl = url;
           }
           if (StreamLearning.getRecommendation(url, patterns, 'audio').recommended && !targetData.taggedAudioUrl) {
              targetData.taggedAudioUrl = url;
           }
        }

        chrome.storage.local.set({ scanned_tasks: tasks, learned_patterns: patterns }, () => {
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
              iconUrl: 'icon.png',
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
}); // closes manifestPromise.then
}); // closes preCheck
}

// =========================================================================
// DECLARATIVE NET REQUEST DYNAMIC BYPASS RULES
// =========================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Determine rule ID dynamically from tab ID to avoid collisions
  const ruleId = (sender.tab && sender.tab.id) ? sender.tab.id : 1001;

  if (message.action === 'fetch_subtitle_sample') {
    fetchSubtitleSample(message.url, message.headers || {})
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, reason: 'fetch-failed' }));
    return true;
  } else if (message.action === 'set_bypass_rules') {
    const targets = Array.isArray(message.targets)
      ? message.targets.filter((target) => target && target.url)
      : (message.targetUrl ? [{ url: message.targetUrl, headers: message.headers || {} }] : []);
    if (targets.length === 0) return;

    const ruleIds = [ruleId, ruleId + 1000000];

    try {
      const uniqueHosts = new Map();
      targets.forEach((target) => {
        const host = new URL(target.url).host;
        if (!uniqueHosts.has(host)) uniqueHosts.set(host, target.headers || {});
      });
      const addRules = Array.from(uniqueHosts.entries()).slice(0, ruleIds.length).flatMap(([host, headers], index) => {
        const requestHeaders = [];
        if (headers.referer) requestHeaders.push({ header: 'referer', operation: 'set', value: headers.referer });
        if (headers.origin) requestHeaders.push({ header: 'origin', operation: 'set', value: headers.origin });
        if (headers['user-agent']) requestHeaders.push({ header: 'user-agent', operation: 'set', value: headers['user-agent'] });
        if (requestHeaders.length === 0) return [];
        return [{
          id: ruleIds[index],
          priority: 1,
          action: { type: 'modifyHeaders', requestHeaders },
          condition: {
            urlFilter: `*://${host}/*`,
            resourceTypes: ['xmlhttprequest', 'media']
          }
        }];
      });

      chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: ruleIds,
        addRules
      }, () => {
        if (chrome.runtime.lastError) {
          console.error(`[DEBUG] DNR Session Rules Registration Failed for Rule ${ruleId}:`, chrome.runtime.lastError);
        } else {
          console.log(`[DEBUG] Successfully registered ${addRules.length} DNR preview bypass rule(s).`);
        }
      });
    } catch (e) {
      console.error("[DEBUG] Failed to setup DNR rules due to URL parsing error:", e);
    }
  } else if (message.action === 'clear_bypass_rules') {
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId, ruleId + 1000000]
    }, () => {
      console.log(`[DEBUG] Cleared active DNR Referer bypass rules (Rule ${ruleId}).`);
    });
  } else if (message.action === 'update_stream_quality') {
    const { url, resolution } = message;
    if (!url || !resolution) return;

    runInQueue((next) => {
      chrome.storage.local.get(['scanned_tasks'], (result) => {
        const tasks = result.scanned_tasks || [];
        let updated = false;

        tasks.forEach(task => {
          let hasUrl = false;
          if (task.rawStreams && task.rawStreams.includes(url)) {
            hasUrl = true;
          } else if (task.type === 'series' && task.episodes) {
            for (const epKey in task.episodes) {
              if (task.episodes[epKey].rawStreams && task.episodes[epKey].rawStreams.includes(url)) {
                hasUrl = true;
                break;
              }
            }
          }

          if (hasUrl) {
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

# StreamHome Chrome Extension - Codebase Audit & Errors Report

This document details all bugs, inconsistencies, structural issues, and functional errors identified during the static analysis of the extension's codebase.

---

## 1. Notification Asset Reference Error (Broken Resource)
* **Location**: `background.js` (Line 449)
* **Code**:
  ```javascript
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.jpg',
    title: `New Stream Discovered (${resLabel} ${typeLabel})`,
    ...
  });
  ```
* **Problem**: The codebase references `icon.jpg` for Chrome desktop notifications, but the extension directory only contains `icon.png`. When the browser attempts to show the desktop notification, it fails to find the asset, which can cause the notification to fail to render entirely or trigger a console warning.
* **Impact**: Desktop notifications for discovered streams are broken or fallback-only.

---

## 2. Declarative Net Request (DNR) Empty Rule Modifiers Bug (Runtime API Crash)
* **Location**: `background.js` (Line 479-501)
* **Code**:
  ```javascript
  const requestHeaders = [];
  if (headers.referer) {
    requestHeaders.push({ header: 'referer', operation: 'set', value: headers.referer });
  }
  ...
  const rule = {
    id: 1001,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: requestHeaders
    },
    ...
  };
  ```
* **Problem**: If `headers` is passed empty (e.g., a stream that did not send or require custom Referer, Origin, or User-Agent headers), `requestHeaders` remains an empty array `[]`. Calling `chrome.declarativeNetRequest.updateSessionRules` with a `modifyHeaders` action containing an empty `requestHeaders` array throws a runtime exception in Chrome: *`"Rule with id 1001 must specify at least one header modifier."`*
* **Impact**: Dynamic header bypass registration crashes silently or throws an API error, preventing playback from loading for clean streams.

---

## 3. Stream Deletion State Non-Persistence (State Management Bug)
* **Location**: `popup.js` (Lines 1839-1877)
* **Code**:
  ```javascript
  function deleteStreamRecord(taskId, url) {
    chrome.storage.local.get(['scanned_tasks'], (result) => {
      const tasks = result.scanned_tasks || [];
      ...
      // Always remove from the primary/unscoped rawStreams
      removeFromArray(task.rawStreams, url);
    });
  }
  ```
* **Problem**: The `deleteStreamRecord` function correctly removes the stream URL from the arrays in memory, but it **never calls `chrome.storage.local.set`** to write the modified `scanned_tasks` array back to local storage! 
* **Impact**: Clicking the "Delete Captured Record" trash button on streams does not persist the deletion. The deleted stream will reappear as soon as the popup reopens or the state is refreshed.

---

## 4. TV Show Quality Metadata Update Failure (DNR & Logic Bypass)
* **Location**: `background.js` (Lines 527-537)
* **Code**:
  ```javascript
  tasks.forEach(task => {
    if (task.rawStreams && task.rawStreams.includes(url)) {
      task.streamQualities = task.streamQualities || {};
      task.streamQualities[url] = [resolution];
      updated = true;
    }
  });
  ```
* **Problem**: When `player.js` loads stream metadata, it sends an `update_stream_quality` message to the background page. The background script attempts to locate the target task by checking if `task.rawStreams.includes(url)` is true. However, for TV series tasks, stream URLs are stored inside episode-specific sub-arrays under `task.episodes[epKey].rawStreams`, and the top-level `task.rawStreams` remains empty. The background script fails to find a match, and the resolution updated from the player is completely ignored for all TV episodes.
* **Impact**: TV Show streams never get their resolved player resolution updated, remaining on generic fallbacks.

---

## 5. DNR Header Bypass Concurrency Conflicts (Race Condition / Collision)
* **Location**: `background.js` (Lines 516-521) and `player.js` (Lines 179-181)
* **Code**:
  ```javascript
  // player.js
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ action: 'clear_bypass_rules' });
  });
  
  // background.js
  } else if (message.action === 'clear_bypass_rules') {
    chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1001]
    });
  }
  ```
* **Problem**: The dynamic DNR rules are registered using a global, hardcoded ID `1001`. If a user opens multiple preview player tabs simultaneously and then closes one of them, the `beforeunload` event of the closed tab triggers a `clear_bypass_rules` message. This completely removes Rule `1001` from the session, immediately breaking dynamic CORS header spoofing for all other player tabs that are still open and playing.
* **Impact**: Concurrent video previews collide and disrupt each other's stream playback when tabs are closed.

---

## 6. Subtitle Reader CORS Fetch Failures (CORS Policy Defect)
* **Location**: `popup.js` (Lines 1483-1492) and `reader.js` (Lines 30-33)
* **Code**:
  ```javascript
  // reader.js
  const res = await fetch(url);
  ```
* **Problem**: The subtitle reader page performs a direct browser `fetch` of the subtitle track `.vtt` / `.srt` URL from the `chrome-extension://` origin. However, streaming sites secure their subtitles behind strict CORS policies. Since the subtitle reader page does not spoof origin or referer headers (unlike the player page), these direct fetch requests fail due to browser CORS blocking.
* **Impact**: Remote subtitle preview tracks almost always fail to load in the subtitle reader view.

---

## 7. Phantom/Dead Variable References in popup.js (Dangling References)
* **Location**: `popup.js` (Lines 96, 148-150)
* **Code**:
  ```javascript
  let taskEpisodicInputsWrapper, inputTaskSeason, inputTaskEpisode, ...
  ...
  taskEpisodicInputsWrapper = document.getElementById('task-episodic-inputs-wrapper');
  inputTaskSeason = document.getElementById('input-task-season');
  inputTaskEpisode = document.getElementById('input-task-episode');
  ```
* **Problem**: `taskEpisodicInputsWrapper`, `inputTaskSeason`, and `inputTaskEpisode` are defined and queried in the popup script initialization, but these elements do not exist in `popup.html` (they were cleaned up/removed when season/episode inputs were moved to the deploy page).
* **Impact**: Redundant variables and dead DOM queries.

---

## 8. Cookie/Storage Desynchronization and Fallback Bug (Session Management Defect)
* **Location**: `popup.js` (Lines 30-54, 248-260)
* **Problem**: In `popup.js`, the extension stores credentials in both localhost cookies and `chrome.storage.local`. When the popup is opened, the `getCookies()` function checks `chrome.cookies` if available. However, if those cookies are null (e.g. they were cleared by the user, blocked, or not accessible due to incognito mode/cookie policies), the function returns nulls. Because there is no fallback inside the `chrome.cookies` resolve path to try loading the values from `chrome.storage.local`, the extension forces the user to the log in screen (`auth` view), even though valid credentials are still stored in `chrome.storage.local`.
* **Impact**: Users are unexpectedly logged out of the extension and forced to re-authenticate if localhost cookies are cleared, blocked, or unavailable.

---

## 9. TheIntroDB Query Parameter Specials Bug (Falsy Season/Episode 0)
* **Location**: `popup.js` (Lines 1613-1615)
* **Code**:
  ```javascript
  if (currentTaskContext.type === 'series' && payload.season && payload.episode) {
    introDbUrl += `&season=${payload.season}&episode=${payload.episode}`;
  }
  ```
* **Problem**: When fetching skip markers from TheIntroDB API for TV show episodes, the code checks if `payload.season && payload.episode` is truthy before appending them as query parameters. In JavaScript, `0` is a falsy value. Therefore, if the user tries to deploy an episode from Season 0 (often used for TV Show specials/extras) or Episode 0, the check fails, and the query parameters `season` and `episode` are omitted from the request URL. This causes the API to return either incorrect markers or fail to find the media.
* **Impact**: Unable to fetch skip markers for any TV show specials (Season 0) or episodes numbered 0.

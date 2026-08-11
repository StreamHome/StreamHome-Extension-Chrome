// State management
let savedServerUrl = 'http://localhost:8000';
let savedApiKey = '';
let savedTmdbApiKey = '';
let scannedTasks = [];
let activeTaskId = null;

// Page selection states
let activeView = 'dashboard';
let currentTaskId = null;
let currentStreamItem = null;
let currentTaskContext = null;
let selectedStreamUrl = null;
let selectedAudioUrl = null;
let activeDeploymentKey = null;
let isRestoringDeploymentDraft = false;
let currentSkipMarkers = createEmptySkipMarkers();
let currentSkipMarkerLookupKey = null;
let currentSkipMarkerLookupStatus = 'idle';
let currentSkipMarkerLookupPromise = null;
let skipMarkerRequestSequence = 0;
let skipMarkerRefreshTimer = null;
let manualSkipMarkers = [];

const DEPLOYMENT_DRAFT_PREFIX = 'deploymentDraft:';
const SKIP_MARKER_TYPES = ['intro', 'recap', 'credits', 'preview'];
const VIDEO_QUALITY_OPTIONS = Object.freeze([
  '4K',
  '2K',
  '1080p',
  '720p',
  '480p',
  '360p',
  '240p',
  '144p'
]);
const DEFAULT_VIDEO_QUALITY = '1080p';
const LANGUAGE_NAMES = Object.freeze({
  en: 'English',
  tr: 'Turkish',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  other: 'Other'
});
const SUBTITLE_LANGUAGE_DISPLAY_NAMES = typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function'
  ? new Intl.DisplayNames(['en'], { type: 'language' })
  : null;
const SUBTITLE_DETECTION_MIN_CHARACTERS = 80;
const SUBTITLE_DETECTION_MIN_RELIABLE_PERCENTAGE = 50;
const SUBTITLE_DETECTION_MIN_UNRELIABLE_PERCENTAGE = 85;
const subtitleLanguageDetectionRequests = new Map();

// Create Task search variables
let selectedTmdbId = null;
let selectedTitle = '';
let selectedContentType = 'movie';
let selectedQuality = '';
let availableAudios = {};
let availableVideos = {};
let availableSubtitles = [];

let searchDebounceTimer = null;

const COOKIE_URL = 'http://localhost/';

function getCookies() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      chrome.cookies.get({ url: COOKIE_URL, name: 'serverHostUrl' }, (c1) => {
        chrome.cookies.get({ url: COOKIE_URL, name: 'serverApiKey' }, (c2) => {
          chrome.cookies.get({ url: COOKIE_URL, name: 'tmdbApiKey' }, (c3) => {
            const result = {
              serverUrl: c1 ? decodeURIComponent(c1.value) : null,
              apiKey: c2 ? decodeURIComponent(c2.value) : null,
              tmdbApiKey: c3 ? decodeURIComponent(c3.value) : null
            };

            // Fallback to storage.local if any cookie values are missing
            if (!result.serverUrl || !result.apiKey || !result.tmdbApiKey) {
              chrome.storage.local.get(['serverUrl', 'apiKey', 'tmdbApiKey'], (localRes) => {
                resolve({
                  serverUrl: result.serverUrl || localRes.serverUrl || null,
                  apiKey: result.apiKey || localRes.apiKey || null,
                  tmdbApiKey: result.tmdbApiKey || localRes.tmdbApiKey || null
                });
              });
            } else {
              resolve(result);
            }
          });
        });
      });
    } else {
      chrome.storage.local.get(['serverUrl', 'apiKey', 'tmdbApiKey'], (result) => {
        resolve({
          serverUrl: result.serverUrl || null,
          apiKey: result.apiKey || null,
          tmdbApiKey: result.tmdbApiKey || null
        });
      });
    }
  });
}

function setCookie(name, value) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      const expiration = Math.round(Date.now() / 1000) + (365 * 24 * 60 * 60 * 5);
      chrome.cookies.set({
        url: COOKIE_URL,
        name: name,
        value: encodeURIComponent(value),
        expirationDate: expiration
      }, () => {
        resolve();
      });
    } else {
      const data = {};
      const key = name === 'serverHostUrl' ? 'serverUrl' : (name === 'serverApiKey' ? 'apiKey' : name);
      data[key] = value;
      chrome.storage.local.set(data, () => {
        resolve();
      });
    }
  });
}

function removeCookie(name) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.cookies) {
      chrome.cookies.remove({ url: COOKIE_URL, name: name }, () => { resolve(); });
    } else {
      const key = name === 'serverHostUrl' ? 'serverUrl' : (name === 'serverApiKey' ? 'apiKey' : name);
      chrome.storage.local.remove([key], () => { resolve(); });
    }
  });
}

// Globally scoped DOM Cache variables
let errorToast, errorMessage, closeToast;
let pageAuth, pageDashboard, pageCreateTask, pagePlayerDeploy, pageTvDetails;
let inputServerUrl, inputApiKey, inputTmdbApiKey, btnVerifyConnect;
let btnDashboardSettings, btnCreateTask, tasksContainer, dashboardEmptyState;
let inputTaskSearch, tmdbSuggestions, taskTypeIndicatorWrapper, taskTypeIndicator;
let btnCancelTask, btnSaveTask;
let btnDeploymentSniff, deploymentCaptureStatus, deploymentCaptureCount, deploymentSourcesList;
let btnTvBack, tvShowTitle, tvShowMeta, tvSeasonsContainer, tvEpisodesContainer;
let btnPlayerBack, playerPageTitle, playerPageMeta, displayStreamUrl;
let playerMetaTmdb, playerMetaType;
let btnDeployServer, btnDownloadStream, btnPreviewStream, iconDeployState, textDeployState;
let qualitySelector, languageSelector, audioSelector, audioSelectorWrapper, subtitlesWrapper, subtitlesList;
let deploySeasonInput, deployEpisodeInput, deployEpisodicInputsWrapper;
let customVideoInput, customAudioInput;
let skipMarkersPanel, skipMarkersStatus, skipMarkersList, btnRetrySkipMarkers;
let manualSkipMarkersEditor, manualSkipMarkerType, manualSkipMarkerStart, manualSkipMarkerEnd;
let btnAddManualSkipMarker, manualSkipMarkersHint, manualSkipMarkersError, manualSkipMarkersList;

let inputCustomSubUrl, inputCustomSubLang, btnAddCustomSub;



document.addEventListener('DOMContentLoaded', () => {
  errorToast = document.getElementById('error-toast');
  errorMessage = document.getElementById('error-message');
  closeToast = document.getElementById('close-toast');

  pageAuth = document.getElementById('page-auth');
  pageDashboard = document.getElementById('page-dashboard');
  pageCreateTask = document.getElementById('page-create-task');
  pagePlayerDeploy = document.getElementById('page-player-deploy');
  pageTvDetails = document.getElementById('page-tv-details');

  inputServerUrl = document.getElementById('input-server-url');
  inputApiKey = document.getElementById('input-api-key');
  inputTmdbApiKey = document.getElementById('input-tmdb-api-key');
  btnVerifyConnect = document.getElementById('btn-verify-connect');

  btnDashboardSettings = document.getElementById('btn-dashboard-settings');
  btnCreateTask = document.getElementById('btn-create-task');
  tasksContainer = document.getElementById('tasks-container');
  dashboardEmptyState = document.getElementById('dashboard-empty-state');

  inputTaskSearch = document.getElementById('input-task-search');
  tmdbSuggestions = document.getElementById('tmdb-suggestions');
  taskTypeIndicatorWrapper = document.getElementById('task-type-indicator-wrapper');
  taskTypeIndicator = document.getElementById('task-type-indicator');
  btnCancelTask = document.getElementById('btn-cancel-task');
  btnSaveTask = document.getElementById('btn-save-task');

  btnDeploymentSniff = document.getElementById('btn-deployment-sniff');
  deploymentCaptureStatus = document.getElementById('deployment-capture-status');
  deploymentCaptureCount = document.getElementById('deployment-capture-count');
  deploymentSourcesList = document.getElementById('deployment-sources-list');

  btnTvBack = document.getElementById('btn-tv-back');
  tvShowTitle = document.getElementById('tv-show-title');
  tvShowMeta = document.getElementById('tv-show-meta');
  tvSeasonsContainer = document.getElementById('tv-seasons-container');
  tvEpisodesContainer = document.getElementById('tv-episodes-container');

  btnPlayerBack = document.getElementById('btn-player-back');
  playerPageTitle = document.getElementById('player-page-title');
  playerPageMeta = document.getElementById('player-page-meta');
  displayStreamUrl = document.getElementById('display-stream-url');
  playerMetaTmdb = document.getElementById('player-meta-tmdb');
  playerMetaType = document.getElementById('player-meta-type');
  btnDeployServer = document.getElementById('btn-deploy-server');
  btnPreviewStream = document.getElementById('btn-preview-stream');
  btnDownloadStream = document.getElementById('btn-download-stream');
  iconDeployState = document.getElementById('icon-deploy-state');
  textDeployState = document.getElementById('text-deploy-state');
  qualitySelector = document.getElementById('quality-selector');
  audioSelector = document.getElementById('audio-selector');
  languageSelector = document.getElementById('language-selector');
  audioSelectorWrapper = document.getElementById('audio-selector-wrapper');
  subtitlesWrapper = document.getElementById('subtitles-wrapper');
  subtitlesList = document.getElementById('subtitles-list');
  deploySeasonInput = document.getElementById('deploy-season-input');
  deployEpisodeInput = document.getElementById('deploy-episode-input');
  deployEpisodicInputsWrapper = document.getElementById('deploy-episodic-inputs-wrapper');
  customVideoInput = document.getElementById('custom-video-input');
  customAudioInput = document.getElementById('custom-audio-input');
  skipMarkersPanel = document.getElementById('skip-markers-panel');
  skipMarkersStatus = document.getElementById('skip-markers-status');
  skipMarkersList = document.getElementById('skip-markers-list');
  btnRetrySkipMarkers = document.getElementById('btn-retry-skip-markers');
  manualSkipMarkersEditor = document.getElementById('manual-skip-markers-editor');
  manualSkipMarkerType = document.getElementById('manual-skip-marker-type');
  manualSkipMarkerStart = document.getElementById('manual-skip-marker-start');
  manualSkipMarkerEnd = document.getElementById('manual-skip-marker-end');
  btnAddManualSkipMarker = document.getElementById('btn-add-manual-skip-marker');
  manualSkipMarkersHint = document.getElementById('manual-skip-markers-hint');
  manualSkipMarkersError = document.getElementById('manual-skip-markers-error');
  manualSkipMarkersList = document.getElementById('manual-skip-markers-list');

  inputCustomSubUrl = document.getElementById('input-custom-sub-url');
  inputCustomSubLang = document.getElementById('input-custom-sub-lang');
  btnAddCustomSub = document.getElementById('btn-add-custom-sub');

  if (closeToast) closeToast.addEventListener('click', hideToast);
  if (inputServerUrl) inputServerUrl.addEventListener('input', (e) => chrome.storage.local.set({ draftServerUrl: e.target.value }));
  if (inputApiKey) inputApiKey.addEventListener('input', (e) => chrome.storage.local.set({ draftApiKey: e.target.value }));
  if (inputTmdbApiKey) inputTmdbApiKey.addEventListener('input', (e) => chrome.storage.local.set({ draftTmdbApiKey: e.target.value }));
  if (btnVerifyConnect) btnVerifyConnect.addEventListener('click', verifyAndConnect);
  if (btnDashboardSettings) btnDashboardSettings.addEventListener('click', disconnectCredentials);
  if (btnCreateTask) btnCreateTask.addEventListener('click', openCreateTaskPanel);
  if (btnCancelTask) btnCancelTask.addEventListener('click', cancelCreateTask);
  if (btnSaveTask) btnSaveTask.addEventListener('click', saveNewTask);
  if (btnTvBack) btnTvBack.addEventListener('click', onTvBackClick);
  if (btnPlayerBack) btnPlayerBack.addEventListener('click', navigateBackFromDeployment);
  if (btnDeploymentSniff) btnDeploymentSniff.addEventListener('click', toggleActiveDeploymentCapture);
  if (btnDownloadStream) btnDownloadStream.addEventListener('click', triggerStreamDownloads);
  if (btnPreviewStream) btnPreviewStream.addEventListener('click', onPreviewClick);
  if (btnDeployServer) btnDeployServer.addEventListener('click', deployMetadataPayload);
  if (btnRetrySkipMarkers) btnRetrySkipMarkers.addEventListener('click', () => fetchSkipMarkersForDeployment({ force: true }));
  if (btnAddManualSkipMarker) btnAddManualSkipMarker.addEventListener('click', addManualSkipMarker);
  if (manualSkipMarkerEnd) {
    manualSkipMarkerEnd.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      addManualSkipMarker();
    });
  }
  [manualSkipMarkerType, manualSkipMarkerStart, manualSkipMarkerEnd].forEach((control) => {
    if (!control) return;
    const eventName = control === manualSkipMarkerType ? 'change' : 'input';
    control.addEventListener(eventName, () => {
      clearManualSkipMarkerError();
      persistDeploymentDraft();
    });
  });
  if (btnAddCustomSub) btnAddCustomSub.addEventListener('click', addCustomSubtitleTrack);
  if (qualitySelector) qualitySelector.addEventListener('change', (e) => onQualityChange(e.target.value));
  if (audioSelector) {
    audioSelector.addEventListener('change', (e) => {
      selectedAudioUrl = e.target.value;
      persistDeploymentDraft();
    });
  }
  if (languageSelector) languageSelector.addEventListener('change', persistDeploymentDraft);
  if (customVideoInput) customVideoInput.addEventListener('input', () => {
    updateSourceDependentActions();
    persistDeploymentDraft();
  });
  if (customAudioInput) customAudioInput.addEventListener('input', persistDeploymentDraft);
  if (deploySeasonInput) {
    deploySeasonInput.addEventListener('input', () => {
      persistDeploymentDraft();
      scheduleSkipMarkerRefresh();
    });
  }
  if (deployEpisodeInput) {
    deployEpisodeInput.addEventListener('input', () => {
      persistDeploymentDraft();
      scheduleSkipMarkerRefresh();
    });
  }
  if (inputCustomSubUrl) inputCustomSubUrl.addEventListener('input', persistDeploymentDraft);
  if (inputCustomSubLang) inputCustomSubLang.addEventListener('input', persistDeploymentDraft);
  if (subtitlesList) {
    subtitlesList.addEventListener('change', (event) => {
      if (event.target && event.target.matches('input[type="checkbox"]')) persistDeploymentDraft();
    });
  }

  initAutocompleteSearch();

  getCookies().then((cookies) => {
    if (cookies.serverUrl) {
      savedServerUrl = cookies.serverUrl;
      inputServerUrl.value = savedServerUrl;
    }
    if (cookies.apiKey) {
      savedApiKey = cookies.apiKey;
      inputApiKey.value = savedApiKey;
      savedTmdbApiKey = cookies.tmdbApiKey || '';
      inputTmdbApiKey.value = savedTmdbApiKey;

      chrome.storage.local.get(['activeTaskId', 'activeView', 'currentTaskId', 'currentStreamItem', 'selectedStreamUrl', 'selectedAudioUrl', 'activeDeploymentKey'], (result) => {
        activeTaskId = result.activeTaskId || null;
        currentTaskId = result.currentTaskId || null;
        const targetView = result.activeView || 'dashboard';

        if (targetView === 'playerDeploy') {
          restorePlayerDeployView(result);
        } else if (targetView === 'taskStreams') {
          openStoredTaskDeployment(currentTaskId);
        } else if (targetView === 'tvDetails') {
          chrome.storage.local.get(['scanned_tasks'], (taskRes) => {
            const tasks = taskRes.scanned_tasks || [];
            const task = tasks.find(t => t.id == currentTaskId);
            if (task) {
              openTvDetailsPage(task);
            } else {
              switchView('dashboard');
            }
          });
        } else if (targetView === 'customRecords') {
          switchView('dashboard');
        } else {
          switchView(targetView);
        }
      });
    } else {
      chrome.storage.local.get(['draftServerUrl', 'draftApiKey', 'draftTmdbApiKey'], (drafts) => {
        if (drafts.draftServerUrl) inputServerUrl.value = drafts.draftServerUrl;
        if (drafts.draftApiKey) inputApiKey.value = drafts.draftApiKey;
        if (drafts.draftTmdbApiKey) inputTmdbApiKey.value = drafts.draftTmdbApiKey;
        switchView('auth');
      });
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.scanned_tasks) {
        scannedTasks = changes.scanned_tasks.newValue || [];
        if (activeView === 'dashboard') {
          renderDashboardTasks();
        } else if (activeView === 'playerDeploy') {
          const currentTask = scannedTasks.find(t => t.id == currentTaskId);
          if (currentTask) {
            chrome.storage.local.get(['learned_patterns'], (pRes) => {
              refreshDeploymentWorkspace(currentTask, pRes.learned_patterns, scannedTasks);
            });
          } else {
            switchView('dashboard');
          }
        }
      }
      if (changes.activeTaskId) {
        activeTaskId = changes.activeTaskId.newValue || null;
        if (activeView === 'dashboard') {
          renderDashboardTasks();
        } else if (activeView === 'playerDeploy') {
          updateDeploymentCaptureButton(currentTaskId == activeTaskId);
          updateDeploymentCaptureStatus();
        }
      }
    }
  });
});

function switchView(target) {
  // If the DOM is not ready yet, wait for it before switching views.
  if (!pageAuth) {
    document.addEventListener('DOMContentLoaded', () => switchView(target));
    return;
  }

  activeView = target;
  chrome.storage.local.set({ activeView: activeView, currentTaskId: currentTaskId });

  const views = {
    auth: pageAuth,
    dashboard: pageDashboard,
    createTask: pageCreateTask,
    playerDeploy: pagePlayerDeploy,
    tvDetails: pageTvDetails
  };

  Object.keys(views).forEach(key => {
    const view = views[key];
    if (!view) return;
    try {
      if (key === target) {
        view.classList.remove('view-hidden');
        view.classList.add('view-visible');
      } else {
        view.classList.remove('view-visible');
        view.classList.add('view-hidden');
      }
    } catch (e) {
      console.error(`Error switching view to '${key}':`, e);
    }
  });

  if (target === 'dashboard') {
    loadDashboardPage();
  }
}

function displayError(msg) {
  if (errorMessage && errorToast) {
    errorMessage.textContent = msg;
    errorToast.classList.remove('-translate-y-full');
    setTimeout(() => { hideToast(); }, 4000);
  }
}

function hideToast() {
  if (errorToast) errorToast.classList.add('-translate-y-full');
}

function makeKeyboardActivatable(element, action, label) {
  element.tabIndex = 0;
  element.setAttribute('role', 'button');
  if (label) element.setAttribute('aria-label', label);
  element.addEventListener('keydown', (event) => {
    if (event.target !== element || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    action();
  });
}

function getTaskDeploymentKey(task) {
  const season = task && task.type === 'series' ? (task.season ?? task.activeSeason ?? '-') : '-';
  const episode = task && task.type === 'series' ? (task.episode ?? task.activeEpisode ?? '-') : '-';
  return `task:${task ? task.type : 'unknown'}:${task ? task.id : 'unknown'}:${season}:${episode}`;
}

function getDeploymentDraftStorageKey(contextKey) {
  return `${DEPLOYMENT_DRAFT_PREFIX}${contextKey}`;
}

function getSelectedSubtitleUrls() {
  if (!subtitlesList) return [];
  return Array.from(subtitlesList.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)'))
    .map((checkbox) => checkbox.value);
}

function getSerializableSubtitles() {
  return (availableSubtitles || [])
    .filter((subtitle) => subtitle && subtitle.url)
    .map((subtitle) => ({
      url: subtitle.url,
      lang: subtitle.lang || subtitle.language || 'en',
      language: subtitle.language || subtitle.lang || 'en',
      label: subtitle.label || subtitle.lang || subtitle.language || 'Subtitle',
      languageSource: subtitle.languageSource || 'unknown',
      languageConfidence: Number.isFinite(Number(subtitle.languageConfidence))
        ? Number(subtitle.languageConfidence)
        : null,
      declaredLanguage: subtitle.declaredLanguage || null,
      declaredLanguageSource: subtitle.declaredLanguageSource || null,
      isBroken: subtitle.isBroken === true,
      brokenReason: subtitle.brokenReason || null,
      defaultSelectionApplied: subtitle.defaultSelectionApplied === true
    }));
}

function collectDeploymentDraft() {
  if (!activeDeploymentKey || !currentTaskContext) return null;

  const selectedAudio = audioSelector ? audioSelector.value : (selectedAudioUrl || '');
  const quality = getCurrentVideoQuality();

  return {
    version: 3,
    kind: 'task',
    contextKey: activeDeploymentKey,
    taskId: currentTaskId ?? currentTaskContext.id,
    currentStreamItem: currentStreamItem || null,
    selectedStreamUrl: selectedStreamUrl || '',
    selectedAudioUrl: selectedAudio || '',
    selectedQuality: quality,
    language: languageSelector ? languageSelector.value : 'en',
    customVideo: customVideoInput ? customVideoInput.value : '',
    customAudio: customAudioInput ? customAudioInput.value : '',
    availableSubtitles: getSerializableSubtitles(),
    selectedSubtitleUrls: getSelectedSubtitleUrls(),
    pendingSubtitleUrl: inputCustomSubUrl ? inputCustomSubUrl.value : '',
    pendingSubtitleLanguage: inputCustomSubLang ? inputCustomSubLang.value : '',
    season: deploySeasonInput ? deploySeasonInput.value : '',
    episode: deployEpisodeInput ? deployEpisodeInput.value : '',
    manualSkipMarkers: getSerializableManualSkipMarkers(),
    pendingManualSkipMarkerType: manualSkipMarkerType ? manualSkipMarkerType.value : 'intro',
    pendingManualSkipMarkerStart: manualSkipMarkerStart ? manualSkipMarkerStart.value : '',
    pendingManualSkipMarkerEnd: manualSkipMarkerEnd ? manualSkipMarkerEnd.value : '',
    updatedAt: Date.now()
  };
}

function persistDeploymentDraft() {
  if (isRestoringDeploymentDraft || activeView !== 'playerDeploy') return Promise.resolve();
  const draft = collectDeploymentDraft();
  if (!draft) return Promise.resolve();

  selectedQuality = draft.selectedQuality;
  selectedAudioUrl = draft.selectedAudioUrl;

  const storageKey = getDeploymentDraftStorageKey(activeDeploymentKey);
  return new Promise((resolve) => {
    chrome.storage.local.set({
      [storageKey]: draft,
      activeDeploymentKey: activeDeploymentKey,
      currentStreamItem: draft.currentStreamItem,
      selectedStreamUrl: draft.selectedStreamUrl,
      selectedAudioUrl: draft.selectedAudioUrl
    }, resolve);
  });
}

function loadDeploymentDraft(contextKey, callback) {
  if (!contextKey) {
    callback(null);
    return;
  }
  const storageKey = getDeploymentDraftStorageKey(contextKey);
  chrome.storage.local.get([storageKey], (result) => callback(result[storageKey] || null));
}

function addSelectOptionIfMissing(select, value) {
  if (!select || !value) return;
  const exists = Array.from(select.options).some((option) => option.value === value);
  if (exists) return;
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  select.appendChild(option);
}

function applyDeploymentDraft(draft) {
  if (!draft) return;
  isRestoringDeploymentDraft = true;

  try {
    if (draft.currentStreamItem) currentStreamItem = draft.currentStreamItem;
    if (typeof draft.selectedStreamUrl === 'string') selectedStreamUrl = draft.selectedStreamUrl;

    if (customVideoInput) customVideoInput.value = draft.customVideo || '';
    if (customAudioInput) customAudioInput.value = draft.customAudio || '';
    if (inputCustomSubUrl) inputCustomSubUrl.value = draft.pendingSubtitleUrl || '';
    if (inputCustomSubLang) inputCustomSubLang.value = draft.pendingSubtitleLanguage || '';

    if (qualitySelector) setSelectedVideoQuality(draft.selectedQuality);

    if (audioSelector) {
      const audioExists = Array.from(audioSelector.options).some((option) => option.value === draft.selectedAudioUrl);
      audioSelector.value = audioExists ? (draft.selectedAudioUrl || '') : '';
      selectedAudioUrl = audioSelector.value;
    }

    if (languageSelector) {
      addSelectOptionIfMissing(languageSelector, draft.language);
      languageSelector.value = draft.language || 'en';
    }

    if (Object.prototype.hasOwnProperty.call(draft, 'season') && deploySeasonInput) {
      deploySeasonInput.value = draft.season ?? '';
    }
    if (Object.prototype.hasOwnProperty.call(draft, 'episode') && deployEpisodeInput) {
      deployEpisodeInput.value = draft.episode ?? '';
    }
    manualSkipMarkers = normalizeManualSkipMarkers(draft.manualSkipMarkers);
    if (manualSkipMarkerType) {
      manualSkipMarkerType.value = SKIP_MARKER_TYPES.includes(draft.pendingManualSkipMarkerType)
        ? draft.pendingManualSkipMarkerType
        : 'intro';
    }
    if (manualSkipMarkerStart) manualSkipMarkerStart.value = draft.pendingManualSkipMarkerStart || '';
    if (manualSkipMarkerEnd) manualSkipMarkerEnd.value = draft.pendingManualSkipMarkerEnd || '';

    const subtitlesByUrl = new Map();
    [...(availableSubtitles || []), ...(draft.availableSubtitles || [])].forEach((subtitle) => {
      if (subtitle && subtitle.url) subtitlesByUrl.set(subtitle.url, subtitle);
    });
    availableSubtitles = Array.from(subtitlesByUrl.values());
    populateSubtitles();

    const selectedSubtitleUrls = new Set(draft.selectedSubtitleUrls || []);
    if (subtitlesList) {
      subtitlesList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        checkbox.checked = !checkbox.disabled && selectedSubtitleUrls.has(checkbox.value);
      });
    }

    if (displayStreamUrl) {
      displayStreamUrl.textContent = selectedStreamUrl || 'Select a detected media source to preview or deploy it.';
    }
  } finally {
    isRestoringDeploymentDraft = false;
  }
}

function restorePlayerDeployView(state) {
  const restoreFromDraft = (draft) => {
    const taskId = draft && draft.taskId != null ? draft.taskId : state.currentTaskId;
    chrome.storage.local.get(['scanned_tasks'], (taskResult) => {
      const tasks = taskResult.scanned_tasks || [];
      const task = tasks.find((item) => item.id == taskId);
      if (!task) {
        switchView('dashboard');
        return;
      }

      currentTaskId = task.id;
      let rawUrls = task.rawStreams || [];
      let renderTask = task;
      if (task.type === 'series') {
        const season = task.activeSeason ?? task.season ?? 1;
        const episode = task.activeEpisode ?? task.episode ?? 1;
        const episodeKey = `${season}x${episode}`;
        const episodeData = task.episodes && task.episodes[episodeKey] ? task.episodes[episodeKey] : null;
        if (episodeData) rawUrls = episodeData.rawStreams || [];
        renderTask = {
          id: task.id,
          title: task.title,
          type: task.type,
          season: season,
          episode: episode,
          rawStreams: rawUrls,
          favorites: episodeData ? (episodeData.favorites || []) : [],
          taggedVideoUrl: episodeData ? episodeData.taggedVideoUrl : null,
          taggedAudioUrl: episodeData ? episodeData.taggedAudioUrl : null,
          capturedHeaders: task.capturedHeaders || {},
          streamQualities: task.streamQualities || {}
        };
      }

      selectedStreamUrl = draft && typeof draft.selectedStreamUrl === 'string' ? draft.selectedStreamUrl : state.selectedStreamUrl;
      selectedAudioUrl = draft && typeof draft.selectedAudioUrl === 'string' ? draft.selectedAudioUrl : state.selectedAudioUrl;
      openPlayerDeployPage(renderTask, null, rawUrls, null, draft || null);
    });
  };

  activeDeploymentKey = state.activeDeploymentKey || null;
  if (activeDeploymentKey) {
    loadDeploymentDraft(activeDeploymentKey, restoreFromDraft);
  } else {
    restoreFromDraft(null);
  }
}

async function verifyAndConnect() {
  const serverVal = inputServerUrl.value.trim().replace(/\/$/, "");
  const apiVal = inputApiKey.value.trim();
  const tmdbVal = inputTmdbApiKey.value.trim();

  if (!serverVal) { displayError('Please specify a valid backend server URL.'); return; }
  if (!apiVal) { displayError('Authenticating credentials/API key cannot be empty.'); return; }
  if (!tmdbVal) { displayError('TMDB API Key (v3) cannot be empty.'); return; }

  savedServerUrl = serverVal;
  savedApiKey = apiVal;
  savedTmdbApiKey = tmdbVal;

  await setCookie('serverHostUrl', savedServerUrl);
  await setCookie('serverApiKey', savedApiKey);
  await setCookie('tmdbApiKey', savedTmdbApiKey);

  chrome.storage.local.set({ 
    serverUrl: savedServerUrl, 
    apiKey: savedApiKey,
    tmdbApiKey: savedTmdbApiKey
  }, () => { 
    chrome.storage.local.remove(['draftServerUrl', 'draftApiKey', 'draftTmdbApiKey']);
    switchView('dashboard'); 
  });
}

async function disconnectCredentials() {
  const credentialDrafts = {
    draftServerUrl: inputServerUrl.value.trim() || savedServerUrl,
    draftApiKey: inputApiKey.value.trim() || savedApiKey,
    draftTmdbApiKey: inputTmdbApiKey.value.trim() || savedTmdbApiKey
  };

  await new Promise((resolve) => {
    chrome.storage.local.set(credentialDrafts, resolve);
  });

  await Promise.all([
    removeCookie('serverHostUrl'),
    removeCookie('serverApiKey'),
    removeCookie('tmdbApiKey')
  ]);

  chrome.storage.local.remove(['apiKey', 'serverUrl', 'tmdbApiKey'], () => {
    savedServerUrl = '';
    savedApiKey = '';
    savedTmdbApiKey = '';
    switchView('auth');
  });
}

function loadDashboardPage() {
  chrome.storage.local.get(['scanned_tasks', 'activeTaskId'], (result) => {
    scannedTasks = result.scanned_tasks || [];
    activeTaskId = result.activeTaskId || null;
    renderDashboardTasks();
  });
}

function openStoredTaskDeployment(taskId) {
  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const tasks = result.scanned_tasks || [];
    const task = tasks.find((item) => item.id == taskId);
    if (!task) {
      switchView('dashboard');
      return;
    }

    currentTaskId = task.id;
    const renderTask = getScopedTaskForRendering(task);
    openPlayerDeployPage(renderTask, null, renderTask.rawStreams || []);
  });
}

function renderDashboardTasks() {
  if (!tasksContainer) return;
  tasksContainer.innerHTML = '';

  if (scannedTasks.length === 0) {
    dashboardEmptyState.style.display = 'flex';
    return;
  }

  dashboardEmptyState.style.display = 'none';

  scannedTasks.forEach((task) => {
    const card = document.createElement('div');
    const isActive = (task.id == activeTaskId);
    card.dataset.active = isActive ? 'true' : 'false';
    const borderCls = isActive ? 'border-orange-500/50' : 'border-slate-800 hover:border-slate-700/80';

    card.className = `capture-card bg-[#1E293B] border p-4 rounded-xl transition-all duration-200 ${borderCls} relative overflow-hidden group cursor-pointer`;
    card.innerHTML = `
      <div class="capture-card__row flex items-center justify-between gap-4">
        <div class="capture-card__main flex items-center gap-3 min-w-0">
          <div class="capture-card__icon w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
            </svg>
          </div>
          <div class="capture-card__copy flex flex-col min-w-0">
            <span class="capture-card__title font-bold text-sm text-slate-100 truncate group-hover:text-cyan-300 transition-colors">${task.title}</span>
            <div class="capture-card__meta flex items-center gap-2">
              <span class="capture-card__type">${task.type}</span>
              ${isActive ? '<span class="capture-card__live"><i></i>Listening</span>' : ''}
            </div>
            <span class="capture-card__status truncate">${task.status || 'Ready to capture'}</span>
          </div>
        </div>
        <button class="capture-card__delete btn-delete-task ember-danger-icon p-1.5 focus:outline-none" aria-label="Delete capture target" title="Delete capture target">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
    `;

    const openTask = () => {
      currentTaskId = task.id;
      if (task.type === 'series') {
        openTvDetailsPage(task);
      } else {
        openPlayerDeployPage(task, null, task.rawStreams || []);
      }
    };

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-task')) return;
      openTask();
    });
    makeKeyboardActivatable(card, openTask, `Open ${task.title} capture target`);

    const btnDelete = card.querySelector('.btn-delete-task');
    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });

    tasksContainer.appendChild(card);
  });
}

function deleteTask(id) {
  chrome.storage.local.get(['scanned_tasks', 'activeTaskId'], (result) => {
    let tasks = result.scanned_tasks || [];
    let activeId = result.activeTaskId;

    tasks = tasks.filter(t => t.id != id);
    if (activeId == id) {
      activeId = null;
      chrome.action.setBadgeText({ text: '' });
    }
    chrome.storage.local.set({ scanned_tasks: tasks, activeTaskId: activeId }, () => { loadDashboardPage(); });
  });
}

function toggleFavorite(taskId, url) {
  chrome.storage.local.get(['scanned_tasks', 'learned_patterns'], (result) => {
    const tasks = result.scanned_tasks || [];
    let patterns = StreamLearning.migratePatterns(result.learned_patterns, tasks);
    const taskIndex = tasks.findIndex(t => t.id == taskId);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    let isAdding = false;

    if (task.type === 'series') {
      const season = task.activeSeason || 1;
      const episode = task.activeEpisode || 1;
      const epKey = `${season}x${episode}`;
      task.episodes = task.episodes || {};
      task.episodes[epKey] = task.episodes[epKey] || { rawStreams: [], favorites: [] };
      const epData = task.episodes[epKey];
      epData.favorites = epData.favorites || [];
      const favIndex = epData.favorites.indexOf(url);
      if (favIndex === -1) {
        epData.favorites.push(url);
        isAdding = true;
      } else {
        epData.favorites.splice(favIndex, 1);
      }
    } else {
      task.favorites = task.favorites || [];
      const favIndex = task.favorites.indexOf(url);
      if (favIndex === -1) {
        task.favorites.push(url);
        isAdding = true;
      } else {
        task.favorites.splice(favIndex, 1);
      }
    }

    patterns = StreamLearning.recordFeedback(patterns, 'favorite', url, isAdding ? 1 : -1);
    chrome.storage.local.set({ scanned_tasks: tasks, learned_patterns: patterns });
  });
}

function openCreateTaskPanel() {
  switchView('createTask');
  inputTaskSearch.value = '';
  tmdbSuggestions.innerHTML = '';
  tmdbSuggestions.classList.add('hidden');
  taskTypeIndicatorWrapper.classList.add('hidden');
  selectedTmdbId = null;
  selectedTitle = '';
  selectedContentType = 'movie';
}

function cancelCreateTask() { switchView('dashboard'); }

function initAutocompleteSearch() {
  if (!inputTaskSearch) return;
  inputTaskSearch.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    const query = inputTaskSearch.value.trim();
    if (query.length < 2) {
      tmdbSuggestions.innerHTML = '';
      tmdbSuggestions.classList.add('hidden');
      return;
    }
    searchDebounceTimer = setTimeout(() => { fetchTmdbSuggestions(query); }, 300);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== inputTaskSearch && e.target !== tmdbSuggestions) {
      tmdbSuggestions.classList.add('hidden');
    }
  });
}

async function fetchTmdbSuggestions(query) {
  if (!savedTmdbApiKey) { displayError('TMDB API Key missing. Please reconnect credentials.'); return; }
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${savedTmdbApiKey}&query=${encodeURIComponent(query)}&language=en-US`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(translateHttpStatus(response.status));
    const data = await response.json();
    renderTmdbSuggestions(data.results || []);
  } catch (err) {
    console.error("[DEBUG] TMDB Fetch Error:", err);
    displayError(err.message || 'Failed to search TMDB titles.');
  }
}

function renderTmdbSuggestions(results) {
  tmdbSuggestions.innerHTML = '';
  const filtered = results.filter(item => item.media_type === 'movie' || item.media_type === 'tv').slice(0, 6);
  if (filtered.length === 0) { tmdbSuggestions.classList.add('hidden'); return; }

  filtered.forEach((item) => {
    const isTv = (item.media_type === 'tv');
    const title = isTv ? item.name : item.title;
    const releaseDate = isTv ? item.first_air_date : item.release_date;
    const year = releaseDate ? releaseDate.substring(0, 4) : 'N/A';

    const row = document.createElement('div');
    row.className = 'p-2.5 hover:bg-slate-800 cursor-pointer text-xs text-slate-200 transition-colors';
    row.textContent = `${title} (${year})`;
    row.addEventListener('click', () => { selectTmdbItem(item, title, year); });
    tmdbSuggestions.appendChild(row);
  });
  tmdbSuggestions.classList.remove('hidden');
}

function selectTmdbItem(item, title, year) {
  inputTaskSearch.value = `${title} (${year})`;
  tmdbSuggestions.innerHTML = '';
  tmdbSuggestions.classList.add('hidden');

  selectedTmdbId = item.id;
  selectedTitle = title;
  selectedContentType = (item.media_type === 'tv') ? 'series' : 'movie';

  taskTypeIndicator.textContent = selectedContentType === 'series' ? 'TV / Series' : 'Movie';
  taskTypeIndicatorWrapper.classList.remove('hidden');
}

function saveNewTask() {
  if (!selectedTmdbId || !selectedTitle) { displayError('Please select a valid title from TMDB suggestions.'); return; }
  let season = null;
  let episode = null;
  // Season and episode inputs are moved to the deploy page.
  // if (selectedContentType === 'series') {
  //   season = parseInt(inputTaskSeason.value, 10);
  //   episode = parseInt(inputTaskEpisode.value, 10);
  //   if (isNaN(season) || season < 1 || isNaN(episode) || episode < 1) {
  //     displayError('Please specify valid season and episode values.');
  //     return;
  //   }
  // }

  const newTask = {
    id: selectedTmdbId,
    title: selectedTitle,
    type: selectedContentType,
    season: season,
    episode: episode,
    status: 'Awaiting Traffic',
    rawStreams: [],
    streams: { combined: [], videoOnly: [], audioOnly: [] }
  };

  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const tasks = result.scanned_tasks || [];
    const duplicateIndex = tasks.findIndex(t => t.id == newTask.id && t.season === newTask.season && t.episode === newTask.episode);
    if (duplicateIndex !== -1) { displayError('A task for this title already exists.'); return; }

    tasks.push(newTask);
    chrome.storage.local.set({ scanned_tasks: tasks }, () => {
      currentTaskId = newTask.id;
      if (newTask.type === 'series') {
        openTvDetailsPage(newTask);
      } else {
        openPlayerDeployPage(newTask, null, []);
      }
    });
  });
}

function navigateBackToDashboard() { switchView('dashboard'); }

function getScopedTaskForRendering(task) {
  if (!task) return null;
  if (task.type !== 'series') return task;
  if (task.season != null && task.episode != null && Array.isArray(task.rawStreams) && !task.episodes) return task;

  const season = task.activeSeason || 1;
  const episode = task.activeEpisode || 1;
  const epKey = `${season}x${episode}`;
  task.episodes = task.episodes || {};
  task.episodes[epKey] = task.episodes[epKey] || {
    rawStreams: [],
    favorites: [],
    taggedVideoUrl: null,
    taggedAudioUrl: null
  };

  return {
    id: task.id,
    title: task.title,
    type: task.type,
    season: season,
    episode: episode,
    rawStreams: task.episodes[epKey].rawStreams || [],
    favorites: task.episodes[epKey].favorites || [],
    taggedVideoUrl: task.episodes[epKey].taggedVideoUrl || null,
    taggedAudioUrl: task.episodes[epKey].taggedAudioUrl || null,
    capturedHeaders: task.capturedHeaders || {},
    streamQualities: task.streamQualities || {}
  };
}

// Akıllı Çözünürlük ve Format Yakalama Helper'ı
function updateDeploymentCaptureButton(isActive) {
  if (!btnDeploymentSniff) return;
  btnDeploymentSniff.dataset.active = isActive ? 'true' : 'false';
  btnDeploymentSniff.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  btnDeploymentSniff.textContent = isActive ? 'Listening' : 'Start listening';
}

function updateDeploymentCaptureStatus() {
  if (!deploymentCaptureStatus) return;
  const isActive = currentTaskId != null && currentTaskId == activeTaskId;
  const sourceCount = deploymentSourcesList
    ? deploymentSourcesList.querySelectorAll('[data-source-url]').length
    : 0;

  if (isActive) {
    deploymentCaptureStatus.textContent = sourceCount > 0
      ? 'Listening for new media in the selected browser tab.'
      : 'Listening. Start playback in the selected browser tab.';
  } else {
    deploymentCaptureStatus.textContent = sourceCount > 0
      ? 'Listening is paused. Existing detected media remains available.'
      : 'Start listening in the source tab to detect media.';
  }
}

function toggleActiveDeploymentCapture() {
  if (currentTaskId == null) return;
  const newActiveId = (activeTaskId == currentTaskId) ? null : currentTaskId;
  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const tasks = result.scanned_tasks || [];
    if (newActiveId === null) {
      chrome.action.setBadgeText({ text: '' });
      chrome.storage.local.set({ activeTaskId: null, activeTabId: null }, () => {
        activeTaskId = null;
        updateDeploymentCaptureButton(false);
        updateDeploymentCaptureStatus();
      });
      return;
    }

    const activeTask = tasks.find((task) => task.id == newActiveId);
    const renderTask = getScopedTaskForRendering(activeTask);
    const streamsCount = renderTask && Array.isArray(renderTask.rawStreams) ? renderTask.rawStreams.length : 0;
    chrome.action.setBadgeText({ text: streamsCount > 0 ? streamsCount.toString() : '0' });
    chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTabId = tabs[0] ? tabs[0].id : null;
      chrome.storage.local.set({ activeTaskId: newActiveId, activeTabId }, () => {
        activeTaskId = newActiveId;
        updateDeploymentCaptureButton(true);
        updateDeploymentCaptureStatus();
      });
    });
  });
}

function getResolutionFromUrl(url) {
  const lowerUrl = url.toLowerCase();
  
  // 1. Standart sayısal çözünürlük kontrolü
  const match = lowerUrl.match(/(1080|720|480|360)p?/);
  if (match) return match[1];
  
  // 2. Yaygın etiket eşleşmeleri
  if (lowerUrl.includes('fhd') || lowerUrl.includes('1080p')) return '1080';
  if (lowerUrl.includes('hd') || lowerUrl.includes('720p')) return '720';
  if (lowerUrl.includes('sd') || lowerUrl.includes('480p')) return '480';
  
  // 3. Dosya formatı veya manifest türüne göre akıllı fallback ayırma
  if (lowerUrl.includes('m3u8') || lowerUrl.includes('hls')) return 'HLS / M3U8';
  if (lowerUrl.includes('mpd') || lowerUrl.includes('dash')) return 'DASH / MPD';
  if (lowerUrl.includes('mp4')) return 'Progressive MP4';
  
  return 'Unknown';
}

// Akıllı ve Temiz İsimlendirme Helper'ı (Domain ve Kaynak Odaklı)
function getMirrorLabel(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace('www.', '');
    
    // Bilinen patikalar için özel etiketler
    if (url.includes('/mx/')) return `Premium Stream Engine (${host} · Line MX)`;
    if (url.includes('/ma/')) return `Standard Stream Engine (${host} · Line MA)`;
    if (url.includes('/m8/')) return `Alternative Stream Engine (${host} · Line M8)`;
    
    // Genel durum: Hangi cdn/domain üzerinden akış geliyorsa onun temiz adı ve dosya uzantısı
    const extMatch = parsed.pathname.match(/\.(m3u8|mpd|mp4|mkv|webm)$/i);
    const typeLabel = extMatch ? extMatch[1].toUpperCase() : 'Media';
    
    return `Stream Source (${host} · ${typeLabel} Live)`;
  } catch (e) {
    return "Stream Source (Alternative Line)";
  }
}

function getSubtitleInfo(url) {
    const lowerUrl = url.toLowerCase();
    // Common language codes/names in file names
    const langMap = {
        'en': ['eng', 'english'], 'tr': ['tur', 'turkish'], 'de': ['ger', 'german'],
        'es': ['spa', 'spanish'], 'fr': ['fre', 'french'], 'it': ['ita', 'italian'],
        'ru': ['rus', 'russian'], 'ja': ['jpn', 'japanese'], 'ko': ['kor', 'korean'], 'zh': ['chi', 'chinese']
    };

    for (const [code, names] of Object.entries(langMap)) {
        const allNames = [code, ...names];
        const regex = new RegExp(`[\\/_\\.-](${allNames.join('|')})([\\/_\\.-]|\\.|$)`, 'i');
        if (regex.test(lowerUrl)) {
            return {
              url,
              lang: code,
              label: getSubtitleLanguageName(code),
              languageSource: 'url'
            };
        }
    }

    return {
      url,
      lang: 'unknown',
      label: getSubtitleLanguageName('unknown'),
      languageSource: 'unknown'
    };
}

// Yeni kategorileri de destekleyen dağıtım motoru
function processRawStreams(rawUrls, task) {
    const itemsByRes = {
        '1080': [],
        '720': [],
        '480': [],
        '360': [],
        'HLS / M3U8': [],
        'DASH / MPD': [],
        'Progressive MP4': [],
        'Unknown': []
    };
    const audioStreams = [];
    const subtitleStreams = [];

  rawUrls.forEach(url => {
    let res = 'Unknown';
    if (task && task.streamQualities && task.streamQualities[url]) {
      const list = task.streamQualities[url] || [];
      const resMatch = list.join(' ').match(/(\d+)p/);
      if (resMatch) {
        res = resMatch[1];
      } else if (list.includes('HLS') || list.includes('HLS / M3U8')) {
        res = 'HLS / M3U8';
      } else if (list.includes('DASH') || list.includes('DASH / MPD')) {
        res = 'DASH / MPD';
      } else {
        res = list[0] || 'Unknown';
      }
    } else {
      res = getResolutionFromUrl(url);
    }
    const label = getMirrorLabel(url);
    const isVr1 = url.toLowerCase().includes('vr1') || url.toLowerCase().includes('vru');

    if (url.toLowerCase().endsWith('.vtt') || url.toLowerCase().endsWith('.srt') || getMirrorLabel(url).toLowerCase().includes('subtitle')) {
        subtitleStreams.push(getSubtitleInfo(url));
        return;
    }

    if (url.match(/\.(mp3|aac|ogg|wav|flac|m4a)$/i) || getMirrorLabel(url).toLowerCase().includes('audio')) {
        audioStreams.push({
            quality: 'Audio',
            videoUrl: null,
            audioUrl: url,
            isVr1: false,
            label: label
        });
        return;
    }


    const targetKey = itemsByRes[res] ? res : 'Unknown';
    
    itemsByRes[targetKey].push({
      type: isVr1 ? 'unified-vr1' : 'unified',
      quality: res,
      videoUrl: url,
      audioUrl: null,
      isVr1: isVr1,
      label: label
    });
  });

    return {
        video: itemsByRes,
        audio: audioStreams,
        subtitles: subtitleStreams
    };
}

function renderGroupedStreams(task, patterns = {}, learningTasks = scannedTasks) {
  if (!deploymentSourcesList) return;
  deploymentSourcesList.innerHTML = '';
  
  const rawUrls = task.rawStreams || [];
  if (rawUrls.length === 0) {
    if (deploymentCaptureCount) deploymentCaptureCount.textContent = '0';
    deploymentSourcesList.innerHTML = `
      <div class="deployment-sources-empty">
        <svg class="w-8 h-8 text-slate-600 mb-2.5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.5 14h.5v.5a.5.5 0 00.5.5h.5v-.5a.5.5 0 00-.5-.5h-.5V13h.5a.5.5 0 00.5-.5v-.5a.5.5 0 00-.5-.5h-.5v.5a.5.5 0 00.5.5h.5zM2 13h10v2H2z"/>
        </svg>
        <span class="text-xs font-semibold text-slate-400">No media signals yet</span>
        <span class="text-[10px] text-slate-500 mt-1 max-w-[240px] leading-relaxed">Select “Start listening”, return to the active browser tab, and begin playback. Captured manifests and media files will appear here.</span>
      </div>
    `;
    return;
  }

  const { video: itemsByRes, audio: audioItems } = processRawStreams(rawUrls, task);
  const favoritesList = task.favorites || [];
  const favoriteItems = [];
  const recommendedItems = [];
  const recommendationCandidates = [];
  const learnedPatterns = StreamLearning.migratePatterns(patterns, learningTasks);

  // Extract favorites and score every eligible recommendation before choosing one winner.
  for (const res in itemsByRes) {
    itemsByRes[res] = itemsByRes[res].filter(item => {
      const targetUrl = item.videoUrl || item.audioUrl;
      const isVideoTagged = task.taggedVideoUrl === targetUrl;
      const isAudioTagged = task.taggedAudioUrl === targetUrl;
      const isTagged = isVideoTagged || isAudioTagged;
      
      const favoriteRecommendation = StreamLearning.getRecommendation(
        targetUrl,
        learnedPatterns,
        'favorite'
      );
      const videoRecommendation = StreamLearning.getRecommendation(
        targetUrl,
        learnedPatterns,
        'video'
      );
      const isRecommended = isTagged
        || favoriteRecommendation.recommended
        || videoRecommendation.recommended;

      if (favoritesList.includes(targetUrl)) {
        favoriteItems.push(item);
        return false; // remove from original category
      }
      if (isRecommended) {
        recommendationCandidates.push({
          item,
          resolution: res,
          score: isVideoTagged
            ? Number.MAX_SAFE_INTEGER
            : isAudioTagged
              ? Number.MAX_SAFE_INTEGER - 1
              : Math.max(favoriteRecommendation.score, videoRecommendation.score)
        });
      }
      return true; // candidates remain in their normal category until one winner is selected
    });
  }

  const bestRecommendation = StreamLearning.selectBestRecommendation(recommendationCandidates);
  if (bestRecommendation) {
    recommendedItems.push(bestRecommendation.item);
    itemsByRes[bestRecommendation.resolution] = itemsByRes[bestRecommendation.resolution]
      .filter(item => item !== bestRecommendation.item);
  }

  const categories = [
    { id: 'res-favorites', title: '★ Favorite Streams', items: favoriteItems, color: 'text-amber-400', badgeBg: 'bg-amber-950/80 border-amber-800/40 text-amber-400 font-bold' },
    { id: 'res-recommended', title: '💡 Recommended Streams', items: recommendedItems, color: 'text-emerald-400', badgeBg: 'bg-emerald-950/80 border-emerald-800/40 text-emerald-400 font-bold' },
    { id: 'res-1080', title: '1080p Full HD', items: itemsByRes['1080'] || [], color: 'text-purple-400', badgeBg: 'bg-purple-950/80 border-purple-800/40 text-purple-400' },
    { id: 'res-720', title: '720p HD', items: itemsByRes['720'] || [], color: 'text-cyan-400', badgeBg: 'bg-cyan-950/80 border-cyan-800/40 text-cyan-400' },
    { id: 'res-480', title: '480p SD', items: itemsByRes['480'] || [], color: 'text-amber-400', badgeBg: 'bg-amber-950/80 border-amber-800/40 text-amber-400' },
    { id: 'res-360', title: '360p SD', items: itemsByRes['360'] || [], color: 'text-emerald-400', badgeBg: 'bg-emerald-950/80 border-emerald-800/40 text-emerald-400' },
    { id: 'res-hls', title: 'HLS Streams (.m3u8)', items: itemsByRes['HLS / M3U8'] || [], color: 'text-indigo-400', badgeBg: 'bg-indigo-950/80 border-indigo-800/40 text-indigo-400' },
    { id: 'res-dash', title: 'DASH Streams (.mpd)', items: itemsByRes['DASH / MPD'] || [], color: 'text-blue-400', badgeBg: 'bg-blue-950/80 border-blue-800/40 text-blue-400' },
    { id: 'res-mp4', title: 'Progressive Videos (.mp4)', items: itemsByRes['Progressive MP4'] || [], color: 'text-teal-400', badgeBg: 'bg-teal-950/80 border-teal-800/40 text-teal-400' },
    { id: 'res-unknown', title: 'Other/Unknown Streams', items: itemsByRes['Unknown'] || [], color: 'text-slate-400', badgeBg: 'bg-slate-900 border-slate-800 text-slate-400' }
  ];

  let hasExpanded = false;
  categories.forEach((cat) => {
    if (cat.items.length === 0) return;

    const accordion = document.createElement('div');
    accordion.className = 'border border-slate-800 rounded-xl overflow-hidden bg-[#1E293B]/20 transition-all duration-200';
    const defaultOpen = !hasExpanded;
    if (defaultOpen) hasExpanded = true;

    accordion.innerHTML = `
      <button class="accordion-header w-full flex items-center justify-between p-3.5 bg-[#1E293B]/70 hover:bg-[#1E293B] text-slate-200 font-bold text-xs tracking-wider uppercase transition-colors focus:outline-none">
        <div class="flex items-center gap-2">
          <span class="${cat.color}">${cat.title}</span>
          <span class="text-[9px] px-1.5 py-0.5 rounded ${cat.badgeBg} font-medium normal-case">${cat.items.length} ${cat.items.length === 1 ? 'source' : 'sources'}</span>
        </div>
        <svg class="accordion-icon w-4 h-4 text-slate-400 transform transition-transform duration-300 ${defaultOpen ? 'rotate-180' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      <div class="accordion-content accordion-content-body overflow-hidden transition-all duration-300 max-h-0 opacity-0 ${defaultOpen ? 'view-visible' : 'view-hidden'}" style="${defaultOpen ? 'max-height: 3000px; opacity: 1;' : ''}">
        <div class="p-3.5 space-y-2 bg-[#0F172A]/40 border-t border-slate-900/80"></div>
      </div>
    `;

    const contentWrapper = accordion.querySelector('.accordion-content-body > div');

    cat.items.forEach((item, index) => {
      const mirrorCard = document.createElement('div');
      const targetUrl = item.videoUrl || item.audioUrl;
      const isSelected = selectedStreamUrl === targetUrl;
      mirrorCard.className = 'deployment-source-card group relative flex flex-col justify-between p-3 cursor-pointer transition-all duration-200';
      mirrorCard.dataset.sourceUrl = targetUrl;
      mirrorCard.dataset.sourceLabel = item.label;
      mirrorCard.dataset.selected = isSelected ? 'true' : 'false';
      mirrorCard.setAttribute('role', 'radio');
      mirrorCard.setAttribute('aria-checked', isSelected ? 'true' : 'false');
      mirrorCard.setAttribute('aria-label', `${isSelected ? 'Selected' : 'Select'} ${item.label}`);
      mirrorCard.tabIndex = 0;
      const isFavorite = favoritesList.includes(targetUrl);

      const starSvg = isFavorite 
        ? `<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`
        : `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.969 0 1.371 1.24.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.18 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.98 9.42c-.783-.57-.38-1.81.588-1.81h4.906a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;

      mirrorCard.innerHTML = `
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Mirror Source #${index + 1}</span>
          <div class="flex items-center gap-1">
            <span class="deployment-source-selected-indicator" aria-hidden="true">${isSelected ? 'Selected' : 'Select'}</span>
            <button class="stream-action stream-action--favorite btn-favorite-stream ${isFavorite ? 'is-active' : ''} focus:outline-none" aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}" title="${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}">
              ${starSvg}
            </button>
            <button class="stream-action stream-action--danger btn-delete-stream focus:outline-none" aria-label="Delete detected source" title="Delete detected source">
              <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
            <svg class="w-3 h-3 text-slate-500 group-hover:text-cyan-400 transform group-hover:translate-x-0.5 transition-all ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
            </svg>
          </div>
        </div>
        <div class="text-[11px] font-bold text-slate-200 mb-1 leading-normal truncate group-hover:text-cyan-300">${item.label}</div>
        <div class="text-[10px] font-mono text-slate-500 group-hover:text-slate-400 break-all select-none line-clamp-1 leading-normal">${targetUrl}</div>
      `;

      const btnFav = mirrorCard.querySelector('.btn-favorite-stream');
      btnFav.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(task.id, targetUrl);
      });

      const btnDel = mirrorCard.querySelector('.btn-delete-stream');
      btnDel.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (selectedStreamUrl === targetUrl) clearDeploymentSourceSelection();
        await deleteStreamRecord(task.id, targetUrl, {
          season: task.season,
          episode: task.episode
        });
      });

      const selectSource = () => selectDeploymentSource(task, item);
      mirrorCard.addEventListener('click', selectSource);
      mirrorCard.addEventListener('keydown', (event) => {
        if (event.target !== mirrorCard || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        selectSource();
      });
      contentWrapper.appendChild(mirrorCard);
    });

    const headerBtn = accordion.querySelector('.accordion-header');
    const content = accordion.querySelector('.accordion-content');
    const icon = accordion.querySelector('.accordion-icon');

    headerBtn.addEventListener('click', () => {
      const isOpen = content.classList.contains('view-visible');
      if (isOpen) {
        content.classList.replace('view-visible', 'view-hidden');
        content.style.maxHeight = '0px'; content.style.opacity = '0';
        icon.classList.remove('rotate-180');
      } else {
        content.classList.replace('view-hidden', 'view-visible');
        content.style.maxHeight = '3000px'; content.style.opacity = '1';
        icon.classList.add('rotate-180');
      }
    });

    deploymentSourcesList.appendChild(accordion);
  });
  const sourceCount = deploymentSourcesList.querySelectorAll('[data-source-url]').length;
  if (deploymentCaptureCount) deploymentCaptureCount.textContent = String(sourceCount);
  updateDeploymentCaptureStatus();
}

function getAvailableVideoItems() {
  return Object.values(availableVideos || {}).flatMap((items) => Array.isArray(items) ? items : []);
}

function findAvailableVideoItem(url) {
  if (!url) return null;
  return getAvailableVideoItems().find((item) => (item.videoUrl || item.audioUrl) === url) || null;
}

function updateSourceDependentActions() {
  const hasSelectedSource = Boolean(selectedStreamUrl);
  const hasDeployableSource = hasSelectedSource || Boolean(customVideoInput && customVideoInput.value.trim());

  if (btnPreviewStream) btnPreviewStream.disabled = !hasSelectedSource;
  if (btnDownloadStream) btnDownloadStream.disabled = !hasSelectedSource;
  if (btnDeployServer && btnDeployServer.dataset.state === 'idle') {
    btnDeployServer.disabled = !hasDeployableSource;
  }
}

function updateRenderedSourceSelection() {
  if (!deploymentSourcesList) return;
  deploymentSourcesList.querySelectorAll('[data-source-url]').forEach((card) => {
    const isSelected = card.dataset.sourceUrl === selectedStreamUrl;
    card.dataset.selected = isSelected ? 'true' : 'false';
    card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    card.setAttribute('aria-label', `${isSelected ? 'Selected' : 'Select'} ${card.dataset.sourceLabel || 'media source'}`);
    const indicator = card.querySelector('.deployment-source-selected-indicator');
    if (indicator) indicator.textContent = isSelected ? 'Selected' : 'Select';
  });
}

function clearDeploymentSourceSelection({ persist = true } = {}) {
  currentStreamItem = null;
  selectedStreamUrl = '';
  if (playerPageMeta) playerPageMeta.textContent = 'No source selected';
  if (displayStreamUrl) displayStreamUrl.textContent = 'Select a detected media source to preview or deploy it.';
  updateRenderedSourceSelection();
  updateSourceDependentActions();
  if (persist) persistDeploymentDraft();
}

function selectDeploymentSource(task, item) {
  if (!item) return;
  currentTaskContext = task;
  currentStreamItem = item;
  selectedStreamUrl = item.videoUrl || item.audioUrl || '';
  if (playerPageMeta) playerPageMeta.textContent = item.label || 'Selected source';
  if (displayStreamUrl) displayStreamUrl.textContent = selectedStreamUrl;
  setSelectedVideoQuality(item.quality);
  updateRenderedSourceSelection();
  updateSourceDependentActions();
  persistDeploymentDraft();
}

function mergeLiveSubtitles(detectedSubtitles) {
  const existingByUrl = new Map((availableSubtitles || [])
    .filter((subtitle) => subtitle && subtitle.url)
    .map((subtitle) => [subtitle.url, subtitle]));
  const nextSubtitles = [];

  (detectedSubtitles || []).forEach((subtitle) => {
    if (!subtitle || !subtitle.url) return;
    nextSubtitles.push(existingByUrl.has(subtitle.url)
      ? { ...subtitle, ...existingByUrl.get(subtitle.url) }
      : subtitle);
    existingByUrl.delete(subtitle.url);
  });

  existingByUrl.forEach((subtitle) => {
    if (subtitle.languageSource === 'manual') nextSubtitles.push(subtitle);
  });
  return nextSubtitles;
}

function refreshDeploymentWorkspace(task, patterns = {}, learningTasks = scannedTasks) {
  const renderTask = getScopedTaskForRendering(task);
  if (!renderTask) return;

  const previousAudio = audioSelector ? audioSelector.value : selectedAudioUrl;
  let stateChanged = false;
  const parsed = processRawStreams(renderTask.rawStreams || [], renderTask);
  currentTaskContext = renderTask;
  availableAudios = parsed.audio;
  availableVideos = parsed.video;
  availableSubtitles = mergeLiveSubtitles(parsed.subtitles);

  const selectedItem = findAvailableVideoItem(selectedStreamUrl);
  if (selectedStreamUrl && !selectedItem) {
    clearDeploymentSourceSelection({ persist: false });
    stateChanged = true;
  } else if (selectedItem) {
    currentStreamItem = selectedItem;
    if (playerPageMeta) playerPageMeta.textContent = selectedItem.label || 'Selected source';
    if (displayStreamUrl) displayStreamUrl.textContent = selectedStreamUrl;
  }

  populateAudioSelector();
  if (audioSelector) {
    const audioExists = Array.from(audioSelector.options).some((option) => option.value === previousAudio);
    audioSelector.value = audioExists ? previousAudio : '';
    selectedAudioUrl = audioSelector.value;
    if (previousAudio && !audioExists) stateChanged = true;
  }
  populateSubtitles({ preserveSelection: true });
  renderGroupedStreams(renderTask, patterns, learningTasks);
  updateDeploymentCaptureButton(currentTaskId == activeTaskId);
  updateSourceDependentActions();
  if (stateChanged) persistDeploymentDraft();
}

function navigateBackFromDeployment() {
  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const task = (result.scanned_tasks || []).find((item) => item.id == currentTaskId);
    if (task && task.type === 'series') {
      openTvDetailsPage(task);
    } else {
      switchView('dashboard');
    }
  });
}

function openPlayerDeployPage(task, selectedItem = null, rawUrls = [], audioItem = null, restoredDraft = undefined) {
  currentTaskId = task.id;
  resetManualSkipMarkerEditor();

  if (customVideoInput) customVideoInput.value = '';
  if (customAudioInput) customAudioInput.value = '';
  if (inputCustomSubUrl) inputCustomSubUrl.value = '';
  if (inputCustomSubLang) inputCustomSubLang.value = '';

  const { audio, subtitles, video } = processRawStreams(rawUrls, task);
  availableAudios = audio;
  availableSubtitles = subtitles;
  availableVideos = video;
  currentTaskContext = task;

  currentStreamItem = selectedItem;
  selectedStreamUrl = selectedItem ? (selectedItem.videoUrl || selectedItem.audioUrl || '') : '';
  const preferredAudioUrl = audioItem ? (audioItem.videoUrl || audioItem.audioUrl || '') : '';
  activeDeploymentKey = getTaskDeploymentKey(task);

  playerPageTitle.textContent = task.title;
  playerPageMeta.textContent = selectedItem ? selectedItem.label : 'No source selected';
  displayStreamUrl.textContent = selectedStreamUrl || 'Select a detected media source to preview or deploy it.';

  playerMetaTmdb.textContent = task.id;
  playerMetaType.textContent = task.type;

  if (deploySeasonInput) {
    deploySeasonInput.disabled = false;
    deploySeasonInput.classList.remove('bg-[#1E293B]/50', 'text-slate-500', 'cursor-not-allowed');
  }
  if (deployEpisodeInput) {
    deployEpisodeInput.disabled = false;
    deployEpisodeInput.classList.remove('bg-[#1E293B]/50', 'text-slate-500', 'cursor-not-allowed');
  }

  if (task.type === 'series') {
    deployEpisodicInputsWrapper.classList.remove('hidden');
    deploySeasonInput.value = task.season ?? '';
    deployEpisodeInput.value = task.episode ?? '';
    deploySeasonInput.disabled = true;
    deployEpisodeInput.disabled = true;
    deploySeasonInput.classList.add('bg-[#1E293B]/50', 'text-slate-500', 'cursor-not-allowed');
    deployEpisodeInput.classList.add('bg-[#1E293B]/50', 'text-slate-500', 'cursor-not-allowed');
  } else {
    deployEpisodicInputsWrapper.classList.add('hidden');
  }

  populateQualitySelector();
  setSelectedVideoQuality(selectedItem ? selectedItem.quality : DEFAULT_VIDEO_QUALITY);

  populateAudioSelector();
  const preferredAudioExists = Array.from(audioSelector.options).some((option) => option.value === preferredAudioUrl);
  audioSelector.value = preferredAudioExists ? preferredAudioUrl : '';
  selectedAudioUrl = audioSelector.value;

  populateLanguageSelector();
  populateSubtitles();

  resetDeployButtonState();
  const deploymentKey = activeDeploymentKey;
  const finishOpening = (draft) => {
    if (activeDeploymentKey !== deploymentKey) return;
    switchView('playerDeploy');
    applyDeploymentDraft(draft);
    chrome.storage.local.get(['scanned_tasks', 'activeTaskId', 'learned_patterns'], (result) => {
      if (activeDeploymentKey !== deploymentKey) return;
      scannedTasks = result.scanned_tasks || [];
      activeTaskId = result.activeTaskId || null;
      const storedTask = scannedTasks.find((item) => item.id == currentTaskId);
      refreshDeploymentWorkspace(storedTask || task, result.learned_patterns, scannedTasks);
      persistDeploymentDraft();
    });
    fetchSkipMarkersForDeployment({ force: true });
  };

  if (restoredDraft !== undefined) {
    finishOpening(restoredDraft);
  } else {
    loadDeploymentDraft(deploymentKey, finishOpening);
  }
}

function normalizeVideoQuality(quality) {
  const value = String(quality || '').trim().toLowerCase();
  if (!value) return null;

  if (/(^|\D)4k(\D|$)/.test(value) || /(^|\D)2160p?(\D|$)/.test(value)) return '4K';
  if (/(^|\D)2k(\D|$)/.test(value) || /(^|\D)1440p?(\D|$)/.test(value)) return '2K';

  for (const height of ['1080', '720', '480', '360', '240', '144']) {
    const qualityPattern = new RegExp(`(^|\\D)${height}p?(\\D|$)`);
    if (qualityPattern.test(value)) return `${height}p`;
  }

  return null;
}

function getCurrentVideoQuality() {
  const selectorQuality = qualitySelector ? normalizeVideoQuality(qualitySelector.value) : null;
  return selectorQuality || normalizeVideoQuality(selectedQuality) || DEFAULT_VIDEO_QUALITY;
}

function setSelectedVideoQuality(quality) {
  selectedQuality = normalizeVideoQuality(quality) || DEFAULT_VIDEO_QUALITY;
  if (qualitySelector) qualitySelector.value = selectedQuality;
  return selectedQuality;
}

function populateQualitySelector() {
  if (!qualitySelector) return;
  const currentQuality = normalizeVideoQuality(selectedQuality) || DEFAULT_VIDEO_QUALITY;
  qualitySelector.innerHTML = '';

  VIDEO_QUALITY_OPTIONS.forEach((quality) => {
    const option = document.createElement('option');
    option.value = quality;
    option.textContent = quality;
    qualitySelector.appendChild(option);
  });

  setSelectedVideoQuality(currentQuality);
}

function onQualityChange(quality) {
  setSelectedVideoQuality(quality);
  persistDeploymentDraft();
}

function populateAudioSelector() {
    audioSelector.innerHTML = '';
    const noAudioOption = document.createElement('option');
    noAudioOption.value = '';
    noAudioOption.textContent = 'No additional audio';
    audioSelector.appendChild(noAudioOption);

    let hasOptions = (availableAudios.length > 0);

    if (availableAudios.length > 0) {
        availableAudios.forEach((audio, index) => {
            const option = document.createElement('option');
            option.value = audio.audioUrl;
            option.textContent = audio.label || `Audio Track #${index + 1}`;
            audioSelector.appendChild(option);
        });
    }

    if (availableVideos) {
        Object.entries(availableVideos).forEach(([res, items]) => {
            if (items && items.length > 0) {
                items.forEach((videoItem) => {
                    const option = document.createElement('option');
                    option.value = videoItem.videoUrl;
                    option.textContent = `[Video as Audio] ${videoItem.label || 'Video Source'} (${res})`;
                    audioSelector.appendChild(option);
                    hasOptions = true;
                });
            }
        });
    }

    if (hasOptions) {
        audioSelectorWrapper.classList.remove('hidden');
    } else {
        audioSelectorWrapper.classList.add('hidden');
    }
    audioSelector.value = '';
}

function populateLanguageSelector() {
    if (!languageSelector) return;
    languageSelector.innerHTML = '';
    Object.entries(LANGUAGE_NAMES).forEach(([code, name]) => {
        const option = document.createElement('option');
        option.value = code;
        option.textContent = name;
        languageSelector.appendChild(option);
    });
    languageSelector.value = 'en';
}

function getSubtitleLanguageName(language) {
    const normalized = String(language || '').trim().toLowerCase();
    if (!normalized || normalized === 'unknown') return 'Unknown language';
    if (LANGUAGE_NAMES[normalized]) return LANGUAGE_NAMES[normalized];
    if (SUBTITLE_LANGUAGE_DISPLAY_NAMES) {
      try {
        const displayName = SUBTITLE_LANGUAGE_DISPLAY_NAMES.of(normalized);
        if (displayName && displayName.toLowerCase() !== normalized) return displayName;
      } catch (error) {
        // Fall back to the submitted code when Intl does not recognize it.
      }
    }
    return normalized.toUpperCase();
}

function getSubtitleDetectionKey(url, contextKey = activeDeploymentKey) {
    return `${contextKey || 'no-context'}:${String(url || '')}`;
}

function isUnknownSubtitleLanguage(subtitle) {
    const language = String(subtitle && (subtitle.lang || subtitle.language) || '').trim().toLowerCase();
    return !language || language === 'unknown' || language === 'und';
}

function normalizeComparableSubtitleLanguage(language) {
    const normalized = String(language || '').trim().toLowerCase().replace(/_/g, '-');
    if (!normalized || normalized === 'unknown' || normalized === 'und') return '';
    const primaryCode = normalized.split('-')[0];
    const aliases = { iw: 'he', in: 'id', ji: 'yi' };
    return aliases[primaryCode] || primaryCode;
}

function shouldDetectSubtitleLanguage(subtitle) {
    return Boolean(subtitle) && subtitle.languageSource !== 'detected' && subtitle.isBroken !== true;
}

function canDetectSubtitleLanguage(subtitle) {
    try {
      const parsedUrl = new URL(subtitle && subtitle.url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch (error) {
      return false;
    }
}

function extractSubtitleDialogue(sample) {
    return String(sample || '')
      .replace(/^\uFEFF/, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\{\\[^}]*\}/g, ' ')
      .split(/\r?\n/)
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (/^(WEBVTT|NOTE|STYLE|REGION)\b/i.test(trimmed)) return false;
        if (/^\d+$/.test(trimmed)) return false;
        if (/^(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/.test(trimmed)) return false;
        return true;
      })
      .join(' ')
      .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30000);
}

function requestSubtitleSample(subtitle) {
    const headers = (currentTaskContext
      && currentTaskContext.capturedHeaders
      && currentTaskContext.capturedHeaders[subtitle.url])
      ? currentTaskContext.capturedHeaders[subtitle.url]
      : {};

    return new Promise((resolve) => {
      if (!chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
        resolve({ ok: false, reason: 'messaging-unavailable' });
        return;
      }

      chrome.runtime.sendMessage({
        action: 'fetch_subtitle_sample',
        url: subtitle.url,
        headers
      }, (response) => {
        const runtimeError = chrome.runtime.lastError;
        resolve(runtimeError ? { ok: false, reason: 'message-failed' } : (response || { ok: false, reason: 'empty-response' }));
      });
    });
}

function detectSubtitleTextLanguage(text) {
    return new Promise((resolve) => {
      if (!chrome.i18n || typeof chrome.i18n.detectLanguage !== 'function') {
        resolve(null);
        return;
      }

      chrome.i18n.detectLanguage(text, (result) => {
        const runtimeError = chrome.runtime.lastError;
        resolve(runtimeError ? null : result);
      });
    });
}

function selectConfidentSubtitleLanguage(result) {
    if (!result || !Array.isArray(result.languages)) return null;

    const candidate = result.languages
      .filter((item) => item && item.language && item.language !== 'und')
      .map((item) => ({
        language: String(item.language).toLowerCase(),
        percentage: Number(item.percentage) || 0
      }))
      .sort((left, right) => right.percentage - left.percentage)[0];

    if (!candidate) return null;
    const threshold = result.isReliable
      ? SUBTITLE_DETECTION_MIN_RELIABLE_PERCENTAGE
      : SUBTITLE_DETECTION_MIN_UNRELIABLE_PERCENTAGE;
    return candidate.percentage >= threshold ? candidate : null;
}

function getSubtitleDetectionStatus(subtitle, contextKey = activeDeploymentKey) {
    if (subtitle.isBroken) {
      const languageWasUnknown = isUnknownSubtitleLanguage(subtitle);
      const reason = subtitle.brokenReason || subtitle.languageDetectionStatus || 'unavailable';
      const explanation = reason === 'uncertain'
        ? (languageWasUnknown
            ? 'Language could not be detected confidently'
            : 'Language could not be verified confidently')
        : (languageWasUnknown
            ? 'Subtitle text was unavailable for detection'
            : 'Subtitle text was unavailable for verification');
      return {
        state: 'broken',
        text: `Broken · ${explanation}`
      };
    }

    if (subtitle.languageSource === 'detected') {
      const confidence = Number(subtitle.languageConfidence);
      const confidenceText = Number.isFinite(confidence) ? ` · ${Math.round(confidence)}%` : '';
      const detectedLanguage = normalizeComparableSubtitleLanguage(subtitle.lang || subtitle.language);
      const declaredLanguage = normalizeComparableSubtitleLanguage(subtitle.declaredLanguage);

      if (declaredLanguage && declaredLanguage === detectedLanguage) {
        return {
          state: 'verified',
          text: `Verified from subtitle text${confidenceText}`
        };
      }

      if (declaredLanguage && declaredLanguage !== detectedLanguage) {
        return {
          state: 'corrected',
          text: `Corrected from ${getSubtitleLanguageName(subtitle.declaredLanguage)}${confidenceText}`
        };
      }

      return {
        state: 'detected',
        text: `Detected from subtitle text${confidenceText}`
      };
    }

    const languageWasUnknown = isUnknownSubtitleLanguage(subtitle);
    const requestKey = getSubtitleDetectionKey(subtitle.url, contextKey);
    const state = subtitle.languageDetectionStatus
      || (subtitleLanguageDetectionRequests.has(requestKey) ? 'detecting' : 'idle');
    if (state === 'detecting') {
      return {
        state,
        text: languageWasUnknown
          ? 'Detecting language from subtitle text…'
          : 'Verifying language from subtitle text…'
      };
    }
    if (state === 'uncertain') {
      return {
        state,
        text: languageWasUnknown
          ? 'Language could not be detected confidently'
          : 'Language could not be verified confidently'
      };
    }
    if (state === 'unavailable') {
      return {
        state,
        text: languageWasUnknown
          ? 'Subtitle text was unavailable for detection'
          : 'Subtitle text was unavailable for verification'
      };
    }
    return null;
}

async function detectSubtitleLanguage(subtitleUrl, contextKey) {
    const requestKey = getSubtitleDetectionKey(subtitleUrl, contextKey);
    if (subtitleLanguageDetectionRequests.has(requestKey)) return subtitleLanguageDetectionRequests.get(requestKey);

    const detectionPromise = (async () => {
      const subtitleAtStart = availableSubtitles.find((item) => item && item.url === subtitleUrl);
      if (!shouldDetectSubtitleLanguage(subtitleAtStart)) return;

      const sampleResponse = await requestSubtitleSample(subtitleAtStart);
      if (activeDeploymentKey !== contextKey) return;

      const currentSubtitle = availableSubtitles.find((item) => item && item.url === subtitleUrl);
      if (!shouldDetectSubtitleLanguage(currentSubtitle)) return;

      if (!sampleResponse.ok) {
        currentSubtitle.languageDetectionStatus = 'unavailable';
        currentSubtitle.isBroken = true;
        currentSubtitle.brokenReason = 'unavailable';
        currentSubtitle.defaultSelectionApplied = true;
        populateSubtitles({ preserveSelection: true });
        await persistDeploymentDraft();
        return;
      }

      const dialogue = extractSubtitleDialogue(sampleResponse.text);
      if (dialogue.length < SUBTITLE_DETECTION_MIN_CHARACTERS) {
        currentSubtitle.languageDetectionStatus = 'uncertain';
        currentSubtitle.isBroken = true;
        currentSubtitle.brokenReason = 'uncertain';
        currentSubtitle.defaultSelectionApplied = true;
        populateSubtitles({ preserveSelection: true });
        await persistDeploymentDraft();
        return;
      }

      const detectionResult = await detectSubtitleTextLanguage(dialogue);
      if (activeDeploymentKey !== contextKey) return;

      const latestSubtitle = availableSubtitles.find((item) => item && item.url === subtitleUrl);
      if (!shouldDetectSubtitleLanguage(latestSubtitle)) return;

      const detectedLanguage = selectConfidentSubtitleLanguage(detectionResult);
      if (!detectedLanguage) {
        latestSubtitle.languageDetectionStatus = 'uncertain';
        latestSubtitle.isBroken = true;
        latestSubtitle.brokenReason = 'uncertain';
        latestSubtitle.defaultSelectionApplied = true;
        populateSubtitles({ preserveSelection: true });
        await persistDeploymentDraft();
        return;
      }

      const declaredLanguage = latestSubtitle.lang || latestSubtitle.language;
      if (!isUnknownSubtitleLanguage(latestSubtitle)) {
        latestSubtitle.declaredLanguage = latestSubtitle.declaredLanguage || declaredLanguage;
        latestSubtitle.declaredLanguageSource = latestSubtitle.declaredLanguageSource
          || latestSubtitle.languageSource
          || 'unknown';
      }
      latestSubtitle.lang = detectedLanguage.language;
      latestSubtitle.language = detectedLanguage.language;
      latestSubtitle.languageSource = 'detected';
      latestSubtitle.languageConfidence = detectedLanguage.percentage;
      const shouldApplyDefaultSelection = latestSubtitle.defaultSelectionApplied !== true;
      latestSubtitle.isBroken = false;
      latestSubtitle.defaultSelectionApplied = true;
      delete latestSubtitle.brokenReason;
      delete latestSubtitle.languageDetectionStatus;
      populateSubtitles({
        preserveSelection: true,
        defaultSelectUrls: shouldApplyDefaultSelection ? [subtitleUrl] : []
      });
      await persistDeploymentDraft();
    })().finally(() => {
      subtitleLanguageDetectionRequests.delete(requestKey);
    });

    subtitleLanguageDetectionRequests.set(requestKey, detectionPromise);
    return detectionPromise;
}

function populateSubtitles(options = {}) {
    if (!subtitlesList || !subtitlesWrapper) return;
    const preserveSelection = Boolean(options.preserveSelection);
    const selectedSubtitleUrls = preserveSelection ? new Set(getSelectedSubtitleUrls()) : new Set();
    const defaultSelectUrls = new Set(options.defaultSelectUrls || []);
    const contextKey = activeDeploymentKey;
    const pendingDetections = [];

    subtitlesList.innerHTML = '';
    if (availableSubtitles.length > 0) {
        subtitlesWrapper.classList.remove('hidden');
        availableSubtitles.forEach((sub, index) => {
            const requestKey = getSubtitleDetectionKey(sub.url, contextKey);
            if (shouldDetectSubtitleLanguage(sub)) {
              if (subtitleLanguageDetectionRequests.has(requestKey)
                && (!sub.languageDetectionStatus || sub.languageDetectionStatus === 'idle' || sub.languageDetectionStatus === 'detecting')) {
                sub.languageDetectionStatus = 'detecting';
              } else if (!sub.languageDetectionStatus || sub.languageDetectionStatus === 'idle') {
                if (canDetectSubtitleLanguage(sub) && contextKey) {
                  sub.languageDetectionStatus = 'detecting';
                  pendingDetections.push(sub.url);
                } else {
                  sub.languageDetectionStatus = 'unavailable';
                  sub.isBroken = true;
                  sub.brokenReason = 'unavailable';
                  sub.defaultSelectionApplied = true;
                }
              }
            } else if (!sub.isBroken && sub.defaultSelectionApplied !== true) {
              sub.defaultSelectionApplied = true;
              defaultSelectUrls.add(sub.url);
            }

            const lang = sub.lang || sub.language || 'en';
            const languageName = getSubtitleLanguageName(lang);
            const id = `sub-checkbox-${index}`;
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'subtitle-track-row';
            if (sub.isBroken) checkboxWrapper.dataset.state = 'broken';

            const checkbox = document.createElement('input');
            checkbox.id = id;
            checkbox.type = 'checkbox';
            checkbox.value = sub.url;
            checkbox.dataset.lang = lang;
            checkbox.className = 'subtitle-track-checkbox';
            checkbox.disabled = sub.isBroken === true;
            checkbox.checked = !checkbox.disabled
              && (selectedSubtitleUrls.has(sub.url) || defaultSelectUrls.has(sub.url));
            if (checkbox.disabled) checkbox.setAttribute('aria-disabled', 'true');

            const label = document.createElement('label');
            label.htmlFor = id;
            label.className = 'subtitle-track-label';
            label.title = sub.url;

            const languageLine = document.createElement('span');
            languageLine.className = 'subtitle-track-language-line';

            const languageText = document.createElement('span');
            languageText.className = 'subtitle-track-language';
            languageText.textContent = languageName;

            const languageCode = document.createElement('span');
            languageCode.className = 'subtitle-track-code';
            languageCode.textContent = String(lang || 'unknown').toUpperCase();

            languageLine.append(languageText, languageCode);
            label.append(languageLine);

            const detectionStatus = getSubtitleDetectionStatus(sub, contextKey);
            if (detectionStatus) {
              const status = document.createElement('span');
              status.className = 'subtitle-track-detection';
              status.dataset.state = detectionStatus.state;
              status.textContent = detectionStatus.text;
              label.append(status);
            }
            
            const actions = document.createElement('div');
            actions.className = 'subtitle-track-actions';

            const readButton = document.createElement('button');
            readButton.type = 'button';
            readButton.className = 'ember-inline-action subtitle-track-read';
            readButton.textContent = 'Read';
            readButton.setAttribute('aria-label', `Read ${languageName} subtitles`);
            readButton.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              
              const subHeaders = (currentTaskContext && currentTaskContext.capturedHeaders && currentTaskContext.capturedHeaders[sub.url])
                ? currentTaskContext.capturedHeaders[sub.url]
                : {};
              
              const readerParams = new URLSearchParams();
              readerParams.set('url', sub.url);
              readerParams.set('label', languageName);
              if (subHeaders.referer) readerParams.set('referer', subHeaders.referer);
              if (subHeaders.origin) readerParams.set('origin', subHeaders.origin);
              if (subHeaders['user-agent']) readerParams.set('useragent', subHeaders['user-agent']);

              chrome.tabs.create({ url: `reader.html?${readerParams.toString()}` });
            });

            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'ember-inline-action ember-inline-action--danger subtitle-track-delete';
            deleteButton.textContent = 'Delete';
            deleteButton.setAttribute('aria-label', `Delete ${languageName} subtitles`);
            deleteButton.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteSubtitleTrack(sub.url);
            });

            actions.append(readButton, deleteButton);
            checkboxWrapper.append(checkbox, label, actions);
            
            subtitlesList.appendChild(checkboxWrapper);
        });
        pendingDetections.forEach((subtitleUrl) => {
          detectSubtitleLanguage(subtitleUrl, contextKey);
        });
    } else {
        subtitlesWrapper.classList.add('hidden');
    }
}

async function deleteSubtitleTrack(url) {
  if (!url) return;

  availableSubtitles = (availableSubtitles || []).filter((subtitle) => subtitle && subtitle.url !== url);
  populateSubtitles({ preserveSelection: true });
  await persistDeploymentDraft();

  if (currentTaskId != null) {
    await deleteStreamRecord(currentTaskId, url, {
      season: currentTaskContext && currentTaskContext.season,
      episode: currentTaskContext && currentTaskContext.episode
    });
  }
}

function resetDeployButtonState() {
  if (!btnDeployServer) return;
  btnDeployServer.dataset.state = 'idle';
  btnDeployServer.className = 'ember-primary flex-1 py-2.5 px-3 flex items-center justify-center gap-1.5';
  iconDeployState.innerHTML = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
  `;
  textDeployState.textContent = 'Send to StreamHome';
  updateSourceDependentActions();
}

function onPreviewClick() {
  const targetUrl = selectedStreamUrl;
  if (!targetUrl) { displayError('No active stream URL selected.'); return; }
  
  const headers = (currentTaskContext.capturedHeaders && targetUrl) ? currentTaskContext.capturedHeaders[targetUrl] : {};
  
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  params.set('title', currentTaskContext.title || '');
  if (headers.referer) params.set('referer', headers.referer);
  if (headers.origin) params.set('origin', headers.origin);
  if (headers['user-agent']) params.set('useragent', headers['user-agent']);
  
  const selectedAudio = audioSelector ? audioSelector.value : '';
  if (selectedAudio) {
    params.set('audioUrl', selectedAudio);
    const audioHeaders = (currentTaskContext.capturedHeaders && selectedAudio) ? currentTaskContext.capturedHeaders[selectedAudio] : {};
    if (audioHeaders.referer) params.set('audioReferer', audioHeaders.referer);
    if (audioHeaders.origin) params.set('audioOrigin', audioHeaders.origin);
  }
  
  chrome.tabs.create({ url: `player.html?${params.toString()}` });
}

function triggerStreamDownloads() {
  const targetUrl = selectedStreamUrl;
  if (!targetUrl) { displayError('No active stream URL selected.'); return; }
  chrome.downloads.download({ url: targetUrl }, (downloadId) => {
    const error = chrome.runtime.lastError;
    if (error) displayError(`Download failed: ${error.message}`);
  });
}

async function deployMetadataPayload() {
  const customVideo = customVideoInput ? customVideoInput.value.trim() : '';
  const customAudio = customAudioInput ? customAudioInput.value.trim() : '';

  const finalStreamUrl = customVideo || selectedStreamUrl;
  selectedAudioUrl = customAudio || audioSelector.value;

  if (!finalStreamUrl) { displayError('No video stream has been selected or provided.'); return; }
  if (shouldOfferManualSkipMarkers() && hasPendingManualSkipMarker() && !addManualSkipMarker()) return;
  btnDeployServer.disabled = true;
  btnDeployServer.dataset.state = 'loading';
  textDeployState.textContent = 'Connecting...';
  iconDeployState.innerHTML = `
    <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  `;

  // Only use sniffed headers if we are deploying the sniffed URL itself
  const headers = (!customVideo && currentTaskContext.capturedHeaders && selectedStreamUrl)
    ? currentTaskContext.capturedHeaders[selectedStreamUrl]
    : {};
  
  const selectedLanguage = languageSelector ? languageSelector.value : 'en';
  const selectedSubtitles = [];
  if (subtitlesList) {
    const subtitleCheckboxes = subtitlesList.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
    subtitleCheckboxes.forEach(checkbox => {
        let code = checkbox.dataset.lang || 'en';
        if (code === 'unknown') code = 'en';
        selectedSubtitles.push({
            language: code,
            url: formatLocalPathToServerUrl(checkbox.value)
        });
    });
  }

  // RULE-COMPLIANT PAYLOAD GENERATION
  const payload = {
    video_url: formatLocalPathToServerUrl(finalStreamUrl),
    audio_url: selectedAudioUrl ? formatLocalPathToServerUrl(selectedAudioUrl) : null,
    media_type: currentTaskContext.type === 'series' ? 'tv' : 'movie',
    tmdb_id: parseInt(currentTaskContext.id, 10),
    season: null,
    episode: null,
    headers: headers || {},
    quality: getCurrentVideoQuality(),
    language: (selectedLanguage && selectedLanguage !== 'other') ? selectedLanguage : 'en',
    subtitles: selectedSubtitles
  };
  
  if (currentTaskContext.type === 'series') {
    const season = parseInt(deploySeasonInput.value, 10);
    const episode = parseInt(deployEpisodeInput.value, 10);
    if (isNaN(season) || season < 0 || isNaN(episode) || episode < 0) {
        displayError('Please enter valid season and episode numbers.');
        resetDeployButtonState();
        return;
    }
    payload.season = season;
    payload.episode = episode;
  }

  textDeployState.textContent = 'Checking skip markers...';
  const tidbSkipMarkers = await fetchSkipMarkersForDeployment({ force: currentSkipMarkerLookupStatus === 'error' });
  payload.skip_markers = countSkipMarkers(tidbSkipMarkers) > 0
    ? tidbSkipMarkers
    : convertManualSkipMarkersForPayload();
  textDeployState.textContent = 'Connecting...';

  const requestUrl = `${savedServerUrl}/api/add-movie`;

  fetch(requestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${savedApiKey}`
    }, // [16]
    body: JSON.stringify(payload)
  })
  .then(async (response) => {
    if (!response.ok) {
      displayError(translateHttpStatus(response.status));
      resetDeployButtonState();
      return;
    }

    btnDeployServer.dataset.state = 'success';
    textDeployState.textContent = 'Queued in StreamHome';
    iconDeployState.innerHTML = `
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
    `;

    setTimeout(resetDeployButtonState, 1600);
  })
  .catch((err) => {
    resetDeployButtonState();
    btnDeployServer.classList.add('animate-shake');
    setTimeout(() => { btnDeployServer.classList.remove('animate-shake'); }, 4500);
    displayError(err.message || 'Server Connection Timed Out.');
  });
}

let currentTvTask = null;
let currentSelectedSeason = null;

function openTvDetailsPage(task) {
  currentTvTask = task;
  currentSelectedSeason = null;
  switchView('tvDetails');
  
  if (tvShowTitle) tvShowTitle.textContent = task.title;
  if (tvShowMeta) tvShowMeta.textContent = 'Select season';
  
  if (tvSeasonsContainer) tvSeasonsContainer.classList.remove('hidden');
  if (tvEpisodesContainer) tvEpisodesContainer.classList.add('hidden');
  
  renderSeasonsList(task);
}

async function renderSeasonsList(task) {
  if (!tvSeasonsContainer) return;
  tvSeasonsContainer.innerHTML = '<div class="text-xs text-slate-400 p-4 text-center">Loading seasons...</div>';
  
  let seasons = [];
  if (savedTmdbApiKey && task.id) {
    const url = `https://api.themoviedb.org/3/tv/${task.id}?api_key=${savedTmdbApiKey}&language=en-US`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        seasons = data.seasons || [];
      }
    } catch (e) {
      console.error("Failed to fetch TV details from TMDB:", e);
    }
  }
  
  if (seasons.length === 0) {
    for (let i = 1; i <= 8; i++) {
      seasons.push({
        season_number: i,
        name: `Season ${i}`,
        episode_count: 24
      });
    }
  }
  
  tvSeasonsContainer.innerHTML = '';
  seasons.forEach(season => {
    if (season.season_number === 0 && seasons.length > 1) return;
    
    const card = document.createElement('div');
    card.className = 'flex items-center justify-between p-3.5 bg-[#1E293B]/70 hover:bg-[#1E293B] border border-slate-800 hover:border-cyan-500/50 rounded-xl cursor-pointer transition-all duration-200';
    card.innerHTML = `
      <div class="flex flex-col">
        <span class="font-bold text-xs text-slate-200">${season.name || `Season ${season.season_number}`}</span>
        <span class="text-[9px] text-slate-500 font-bold uppercase mt-0.5">${season.episode_count} Episodes</span>
      </div>
      <svg class="w-4 h-4 text-slate-450" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
      </svg>
    `;
    card.addEventListener('click', () => {
      selectSeason(season);
    });
    makeKeyboardActivatable(card, () => { selectSeason(season); }, `Open ${season.name || `Season ${season.season_number}`}`);
    tvSeasonsContainer.appendChild(card);
  });
}

async function selectSeason(season) {
  currentSelectedSeason = season.season_number;
  if (tvShowMeta) tvShowMeta.textContent = season.name || `Season ${season.season_number}`;
  
  if (!tvEpisodesContainer) return;
  tvEpisodesContainer.innerHTML = '<div class="text-xs text-slate-400 p-4 text-center">Loading episodes...</div>';
  
  if (tvSeasonsContainer) tvSeasonsContainer.classList.add('hidden');
  tvEpisodesContainer.classList.remove('hidden');
  
  let episodes = [];
  if (savedTmdbApiKey && currentTvTask.id) {
    const url = `https://api.themoviedb.org/3/tv/${currentTvTask.id}/season/${season.season_number}?api_key=${savedTmdbApiKey}&language=en-US`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        episodes = data.episodes || [];
      }
    } catch (e) {
      console.error("Failed to fetch Season details from TMDB:", e);
    }
  }
  
  if (episodes.length === 0) {
    const count = season.episode_count || 24;
    for (let i = 1; i <= count; i++) {
      episodes.push({
        episode_number: i,
        name: `Episode ${i}`,
        overview: ''
      });
    }
  }
  
  tvEpisodesContainer.innerHTML = '';
  episodes.forEach(episode => {
    const card = document.createElement('div');
    card.className = 'flex flex-col p-3 bg-[#1E293B]/70 hover:bg-[#1E293B] border border-slate-800 hover:border-cyan-500/50 rounded-xl cursor-pointer transition-all duration-200';
    
    const epKey = `${season.season_number}x${episode.episode_number}`;
    const streamCount = (currentTvTask.episodes && currentTvTask.episodes[epKey] && currentTvTask.episodes[epKey].rawStreams) 
      ? currentTvTask.episodes[epKey].rawStreams.length 
      : 0;
      
    const badge = streamCount > 0 
      ? `<span class="px-1.5 py-0.5 text-[8px] font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded">${streamCount} streams</span>`
      : `<span class="px-1.5 py-0.5 text-[8px] font-bold bg-slate-800 text-slate-500 rounded">no streams</span>`;
      
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <span class="font-bold text-xs text-slate-200">Episode ${episode.episode_number}: ${episode.name}</span>
        ${badge}
      </div>
      ${episode.overview ? `<p class="text-[9px] text-slate-550 mt-1 line-clamp-2 leading-relaxed">${episode.overview}</p>` : ''}
    `;
    card.addEventListener('click', () => {
      selectEpisode(season.season_number, episode.episode_number);
    });
    makeKeyboardActivatable(card, () => { selectEpisode(season.season_number, episode.episode_number); }, `Open episode ${episode.episode_number}: ${episode.name}`);
    tvEpisodesContainer.appendChild(card);
  });
}

function selectEpisode(seasonNumber, episodeNumber) {
  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const tasks = result.scanned_tasks || [];
    const taskIndex = tasks.findIndex(t => t.id == currentTvTask.id);
    if (taskIndex === -1) return;
    
    const task = tasks[taskIndex];
    task.activeSeason = seasonNumber;
    task.activeEpisode = episodeNumber;
    
    chrome.storage.local.set({ scanned_tasks: tasks }, () => {
      currentTaskId = task.id;
      const renderTask = getScopedTaskForRendering(task);
      openPlayerDeployPage(renderTask, null, renderTask.rawStreams || []);
    });
  });
}

function onTvBackClick() {
  if (currentSelectedSeason !== null) {
    currentSelectedSeason = null;
    if (tvShowMeta) tvShowMeta.textContent = 'Select season';
    if (tvSeasonsContainer) tvSeasonsContainer.classList.remove('hidden');
    if (tvEpisodesContainer) tvEpisodesContainer.classList.add('hidden');
  } else {
    switchView('dashboard');
  }
}

function navigateBackFromStreams() {
  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const tasks = result.scanned_tasks || [];
    const task = tasks.find(t => t.id == currentTaskId);
    if (task && task.type === 'series') {
      openTvDetailsPage(task);
    } else {
      switchView('dashboard');
    }
  });
}

function deleteStreamRecord(taskId, url, episodeScope = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['scanned_tasks'], (result) => {
      const tasks = result.scanned_tasks || [];
      const taskIndex = tasks.findIndex(t => t.id == taskId);
      if (taskIndex === -1) {
        resolve();
        return;
      }

      const task = tasks[taskIndex];

      const removeFromArray = (arr, val) => {
        if (!arr) return;
        const index = arr.indexOf(val);
        if (index !== -1) arr.splice(index, 1);
      };

      if (task.type === 'series') {
        const season = (episodeScope && episodeScope.season) ?? task.activeSeason ?? 1;
        const episode = (episodeScope && episodeScope.episode) ?? task.activeEpisode ?? 1;
        const epKey = `${season}x${episode}`;
        if (task.episodes && task.episodes[epKey]) {
          const epData = task.episodes[epKey];
          removeFromArray(epData.rawStreams, url);
          removeFromArray(epData.favorites, url);
          if (epData.taggedVideoUrl === url) epData.taggedVideoUrl = null;
          if (epData.taggedAudioUrl === url) epData.taggedAudioUrl = null;
        }
      } else {
        removeFromArray(task.favorites, url);
        if (task.taggedVideoUrl === url) task.taggedVideoUrl = null;
        if (task.taggedAudioUrl === url) task.taggedAudioUrl = null;
      }

      if (task.capturedHeaders) delete task.capturedHeaders[url];
      if (task.streamQualities) delete task.streamQualities[url];

      // Always remove from the primary/unscoped rawStreams
      removeFromArray(task.rawStreams, url);

      chrome.storage.local.set({ scanned_tasks: tasks }, resolve);
    });
  });
}

function addCustomSubtitleTrack() {
  if (!inputCustomSubUrl || !inputCustomSubLang) return;
  const url = inputCustomSubUrl.value.trim();
  const lang = inputCustomSubLang.value.trim().toLowerCase();

  if (!url) {
    displayError('Please enter a valid subtitle track URL or path.');
    return;
  }
  if (!lang) {
    displayError('Please specify a subtitle language code (e.g. en).');
    return;
  }

  const selectedSubtitleUrls = new Set(getSelectedSubtitleUrls());

  // Push new subtitle and re-populate the checklist
  availableSubtitles.push({
    url: url,
    lang: lang,
    label: getSubtitleLanguageName(lang),
    languageSource: 'manual'
  });

  populateSubtitles();

  // Clear inputs
  inputCustomSubUrl.value = '';
  inputCustomSubLang.value = '';

  // Restore existing choices; the new track activates only after verification succeeds.
  if (subtitlesList) {
    const checkboxes = subtitlesList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox) => {
      checkbox.checked = !checkbox.disabled && selectedSubtitleUrls.has(checkbox.value);
    });
  }
  persistDeploymentDraft();
}

function translateHttpStatus(status) {
  const codes = {
    400: "Bad Request (400) - The server could not understand the request because it was malformed (e.g., invalid payload or parameter format).",
    401: "Unauthorized (401) - Authentication failed. Your API key or connection credentials are missing or invalid.",
    403: "Forbidden (403) - The server refused to authorize the request (e.g., incorrect API permissions).",
    404: "Not Found (404) - The server could not find the requested API endpoint or resource.",
    405: "Method Not Allowed (405) - The server does not support the request method for this API endpoint.",
    408: "Request Timeout (408) - The server timed out waiting for the request to finish.",
    429: "Too Many Requests (429) - Rate limit exceeded. Please wait a bit before requesting again.",
    500: "Internal Server Error (500) - The server encountered an internal error and could not complete the request.",
    502: "Bad Gateway (502) - The server received an invalid response from the upstream server.",
    503: "Service Unavailable (503) - The server is temporarily offline, overloaded, or down for maintenance.",
    504: "Gateway Timeout (504) - The server did not receive a timely response from an upstream server."
  };
  return codes[status] || `HTTP Error (${status}) - An unexpected network response error occurred.`;
}

function createEmptySkipMarkers() {
  return {
    intro: [],
    recap: [],
    credits: [],
    preview: []
  };
}

function normalizeManualSkipMarkers(markers) {
  if (!Array.isArray(markers)) return [];

  return markers
    .map((marker) => ({
      type: marker && SKIP_MARKER_TYPES.includes(marker.type) ? marker.type : null,
      start_ms: Number(marker && marker.start_ms),
      end_ms: Number(marker && marker.end_ms)
    }))
    .filter((marker) => marker.type
      && Number.isFinite(marker.start_ms)
      && marker.start_ms >= 0
      && Number.isFinite(marker.end_ms)
      && marker.end_ms > marker.start_ms)
    .sort((left, right) => left.start_ms - right.start_ms || left.type.localeCompare(right.type));
}

function resetManualSkipMarkerEditor() {
  manualSkipMarkers = [];
  if (manualSkipMarkerType) manualSkipMarkerType.value = 'intro';
  if (manualSkipMarkerStart) manualSkipMarkerStart.value = '';
  if (manualSkipMarkerEnd) manualSkipMarkerEnd.value = '';
  if (manualSkipMarkersEditor) manualSkipMarkersEditor.hidden = true;
  clearManualSkipMarkerError();
}

function getSerializableManualSkipMarkers() {
  return normalizeManualSkipMarkers(manualSkipMarkers).map((marker) => ({
    type: marker.type,
    start_ms: marker.start_ms,
    end_ms: marker.end_ms
  }));
}

function parseSkipMarkerClock(value) {
  const match = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(String(value || '').trim());
  if (!match) return null;

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3], 10);
  return ((hours * 60 * 60) + (minutes * 60) + seconds) * 1000;
}

function formatSkipMarkerMilliseconds(milliseconds) {
  const totalSeconds = Math.round(Number(milliseconds) / 1000);
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '00:00:00';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clearManualSkipMarkerError() {
  if (!manualSkipMarkersError) return;
  manualSkipMarkersError.textContent = '';
  manualSkipMarkersError.hidden = true;
}

function showManualSkipMarkerError(message) {
  if (!manualSkipMarkersError) {
    displayError(message);
    return;
  }
  manualSkipMarkersError.textContent = message;
  manualSkipMarkersError.hidden = false;
}

function hasPendingManualSkipMarker() {
  return Boolean(
    (manualSkipMarkerStart && manualSkipMarkerStart.value.trim())
    || (manualSkipMarkerEnd && manualSkipMarkerEnd.value.trim())
  );
}

function shouldOfferManualSkipMarkers() {
  return Boolean(manualSkipMarkersEditor && !manualSkipMarkersEditor.hidden);
}

function addManualSkipMarker() {
  const type = manualSkipMarkerType ? manualSkipMarkerType.value : '';
  const startMs = parseSkipMarkerClock(manualSkipMarkerStart ? manualSkipMarkerStart.value : '');
  const endMs = parseSkipMarkerClock(manualSkipMarkerEnd ? manualSkipMarkerEnd.value : '');

  clearManualSkipMarkerError();

  if (!SKIP_MARKER_TYPES.includes(type)) {
    showManualSkipMarkerError('Select a valid marker type.');
    return false;
  }
  if (startMs === null || endMs === null) {
    showManualSkipMarkerError('Use HH:MM:SS for both start and end.');
    return false;
  }
  if (endMs <= startMs) {
    showManualSkipMarkerError('End time must be later than start time.');
    return false;
  }

  const duplicate = manualSkipMarkers.some((marker) => (
    marker.type === type && marker.start_ms === startMs && marker.end_ms === endMs
  ));
  if (duplicate) {
    showManualSkipMarkerError('That marker is already in the manual fallback.');
    return false;
  }

  manualSkipMarkers.push({ type, start_ms: startMs, end_ms: endMs });
  manualSkipMarkers = normalizeManualSkipMarkers(manualSkipMarkers);
  if (manualSkipMarkerStart) manualSkipMarkerStart.value = '';
  if (manualSkipMarkerEnd) manualSkipMarkerEnd.value = '';
  renderManualSkipMarkerEditor(currentSkipMarkerLookupStatus);
  persistDeploymentDraft();
  return true;
}

function removeManualSkipMarker(index) {
  if (!Number.isInteger(index) || index < 0 || index >= manualSkipMarkers.length) return;
  manualSkipMarkers.splice(index, 1);
  renderManualSkipMarkerEditor(currentSkipMarkerLookupStatus);
  persistDeploymentDraft();
}

function renderManualSkipMarkerEditor(status) {
  if (!manualSkipMarkersEditor || !manualSkipMarkersList) return;

  const canUseManualFallback = status === 'empty' || status === 'error';
  const shouldShow = canUseManualFallback || manualSkipMarkers.length > 0;
  manualSkipMarkersEditor.hidden = !shouldShow;
  if (!shouldShow) return;

  if (manualSkipMarkersHint) {
    manualSkipMarkersHint.textContent = canUseManualFallback
      ? 'Enter start and end as HH:MM:SS. Values are stored internally in milliseconds.'
      : 'TheIntroDB markers are active. This saved manual fallback is not being sent.';
  }

  [manualSkipMarkerType, manualSkipMarkerStart, manualSkipMarkerEnd, btnAddManualSkipMarker].forEach((control) => {
    if (control) control.disabled = !canUseManualFallback;
  });
  if (!canUseManualFallback) clearManualSkipMarkerError();

  manualSkipMarkersList.replaceChildren();
  if (manualSkipMarkers.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'manual-skip-markers-empty';
    emptyMessage.textContent = 'No manual markers added.';
    manualSkipMarkersList.appendChild(emptyMessage);
    return;
  }

  manualSkipMarkers.forEach((marker, index) => {
    const row = document.createElement('div');
    row.className = 'manual-skip-marker-row';

    const details = document.createElement('div');
    details.className = 'manual-skip-marker-details';

    const typeLabel = document.createElement('span');
    typeLabel.className = 'manual-skip-marker-type';
    typeLabel.textContent = marker.type;

    const range = document.createElement('span');
    range.className = 'manual-skip-marker-range';
    range.textContent = `${formatSkipMarkerMilliseconds(marker.start_ms)} - ${formatSkipMarkerMilliseconds(marker.end_ms)}`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'ember-inline-action ember-inline-action--danger manual-skip-marker-remove';
    removeButton.textContent = 'Remove';
    removeButton.setAttribute('aria-label', `Remove ${marker.type} marker ${range.textContent}`);
    removeButton.addEventListener('click', () => removeManualSkipMarker(index));

    details.append(typeLabel, range);
    row.append(details, removeButton);
    manualSkipMarkersList.appendChild(row);
  });
}

function convertManualSkipMarkersForPayload() {
  const groupedMarkers = createEmptySkipMarkers();
  normalizeManualSkipMarkers(manualSkipMarkers).forEach((marker) => {
    groupedMarkers[marker.type].push({
      start_ms: marker.start_ms,
      end_ms: marker.end_ms
    });
  });
  return convertSkipMarkers(groupedMarkers);
}

function getSkipMarkerLookupContext() {
  if (!currentTaskContext) return null;

  const tmdbId = Number.parseInt(currentTaskContext.id, 10);
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) return null;

  const isSeries = currentTaskContext.type === 'series';
  let season = null;
  let episode = null;

  if (isSeries) {
    season = Number.parseInt(deploySeasonInput ? deploySeasonInput.value : '', 10);
    episode = Number.parseInt(deployEpisodeInput ? deployEpisodeInput.value : '', 10);
    if (!Number.isInteger(season) || season < 0 || !Number.isInteger(episode) || episode < 0) return null;
  }

  return {
    tmdbId,
    isSeries,
    season,
    episode,
    deploymentKey: activeDeploymentKey,
    key: `${isSeries ? 'tv' : 'movie'}:${tmdbId}:${isSeries ? season : '-'}:${isSeries ? episode : '-'}`
  };
}

function countSkipMarkers(markers) {
  return SKIP_MARKER_TYPES.reduce((total, type) => {
    return total + (Array.isArray(markers && markers[type]) ? markers[type].length : 0);
  }, 0);
}

function formatSkipMarkerTime(seconds) {
  const numericSeconds = Number(seconds);
  if (!Number.isFinite(numericSeconds) || numericSeconds < 0) return 'Unknown';

  const totalSeconds = Math.round(numericSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function formatSkipMarkerRange(marker) {
  const start = Number(marker && marker.start);
  const end = Number(marker && marker.end);
  const startLabel = formatSkipMarkerTime(Number.isFinite(start) ? start : 0);

  if (!Number.isFinite(end) || end <= start) {
    return `${startLabel} - end of media`;
  }
  return `${startLabel} - ${formatSkipMarkerTime(end)}`;
}

function renderSkipMarkerState(status, markers = createEmptySkipMarkers()) {
  if (!skipMarkersPanel || !skipMarkersStatus || !skipMarkersList) return;

  const markerCount = countSkipMarkers(markers);
  const renderedStatus = status === 'ready' && markerCount === 0 ? 'empty' : status;
  const statusMessages = {
    idle: 'Waiting for media details',
    loading: 'Checking TheIntroDB...',
    ready: `${markerCount} marker${markerCount === 1 ? '' : 's'} found`,
    empty: 'No markers found',
    error: 'Lookup unavailable'
  };

  skipMarkersPanel.dataset.state = renderedStatus;
  skipMarkersPanel.setAttribute('aria-busy', renderedStatus === 'loading' ? 'true' : 'false');
  skipMarkersStatus.textContent = statusMessages[renderedStatus] || statusMessages.idle;
  if (btnRetrySkipMarkers) btnRetrySkipMarkers.hidden = renderedStatus !== 'error';
  skipMarkersList.replaceChildren();

  if (renderedStatus !== 'ready') {
    const message = document.createElement('p');
    message.className = 'skip-markers-message';
    if (renderedStatus === 'loading') {
      message.textContent = 'Looking up intro, recap, credits, and preview markers.';
    } else if (renderedStatus === 'empty') {
      message.textContent = 'TheIntroDB has no skip markers for this title or episode. Add a manual fallback below.';
    } else if (renderedStatus === 'error') {
      message.textContent = 'Marker details could not be loaded. Retry, or add a manual fallback below.';
    } else {
      message.textContent = 'Enter valid media details to check TheIntroDB.';
    }
    skipMarkersList.appendChild(message);
    renderManualSkipMarkerEditor(renderedStatus);
    return;
  }

  const labels = {
    intro: 'Intro',
    recap: 'Recap',
    credits: 'Credits',
    preview: 'Preview'
  };

  Object.entries(labels).forEach(([type, label]) => {
    const ranges = Array.isArray(markers[type]) ? markers[type] : [];
    if (ranges.length === 0) return;

    const row = document.createElement('div');
    row.className = 'skip-marker-row';

    const typeLabel = document.createElement('span');
    typeLabel.className = 'skip-marker-type';
    typeLabel.textContent = label;

    const rangeList = document.createElement('span');
    rangeList.className = 'skip-marker-ranges';
    rangeList.textContent = ranges.map(formatSkipMarkerRange).join(', ');

    row.append(typeLabel, rangeList);
    skipMarkersList.appendChild(row);
  });
  renderManualSkipMarkerEditor(renderedStatus);
}

function scheduleSkipMarkerRefresh() {
  if (skipMarkerRefreshTimer) clearTimeout(skipMarkerRefreshTimer);
  if (activeView !== 'playerDeploy' || !currentTaskContext || currentTaskContext.type !== 'series') return;

  skipMarkerRefreshTimer = setTimeout(() => {
    skipMarkerRefreshTimer = null;
    if (activeView === 'playerDeploy') fetchSkipMarkersForDeployment();
  }, 300);
}

async function fetchSkipMarkersForDeployment({ force = false } = {}) {
  const context = getSkipMarkerLookupContext();
  if (!context) {
    currentSkipMarkers = createEmptySkipMarkers();
    currentSkipMarkerLookupKey = null;
    currentSkipMarkerLookupStatus = 'idle';
    renderSkipMarkerState('idle', currentSkipMarkers);
    return currentSkipMarkers;
  }

  if (!force && currentSkipMarkerLookupKey === context.key) {
    if (currentSkipMarkerLookupStatus === 'loading' && currentSkipMarkerLookupPromise) {
      return currentSkipMarkerLookupPromise;
    }
    if (currentSkipMarkerLookupStatus === 'ready' || currentSkipMarkerLookupStatus === 'empty') {
      return currentSkipMarkers;
    }
  }

  const requestSequence = ++skipMarkerRequestSequence;
  currentSkipMarkerLookupKey = context.key;
  currentSkipMarkerLookupStatus = 'loading';
  currentSkipMarkers = createEmptySkipMarkers();
  renderSkipMarkerState('loading', currentSkipMarkers);

  const params = new URLSearchParams({ tmdb_id: String(context.tmdbId) });
  if (context.isSeries) {
    params.set('season', String(context.season));
    params.set('episode', String(context.episode));
  }

  const requestKeyIsCurrent = () => {
    const latestContext = getSkipMarkerLookupContext();
    return requestSequence === skipMarkerRequestSequence
      && activeView === 'playerDeploy'
      && activeDeploymentKey === context.deploymentKey
      && latestContext
      && latestContext.key === context.key;
  };

  const lookupPromise = (async () => {
    try {
      const response = await fetch(`https://api.theintrodb.org/v3/media?${params.toString()}`);
      if (response.status === 404) {
        if (!requestKeyIsCurrent()) return createEmptySkipMarkers();

        currentSkipMarkers = createEmptySkipMarkers();
        currentSkipMarkerLookupStatus = 'empty';
        renderSkipMarkerState('empty', currentSkipMarkers);
        return currentSkipMarkers;
      }
      if (!response.ok) throw new Error(`TheIntroDB returned HTTP ${response.status}`);

      const markers = convertSkipMarkers(await response.json());
      if (!requestKeyIsCurrent()) return createEmptySkipMarkers();

      currentSkipMarkers = markers;
      currentSkipMarkerLookupStatus = countSkipMarkers(markers) > 0 ? 'ready' : 'empty';
      renderSkipMarkerState(currentSkipMarkerLookupStatus, markers);
      return markers;
    } catch (error) {
      if (!requestKeyIsCurrent()) return createEmptySkipMarkers();

      console.warn('TheIntroDB skip-marker lookup failed.');
      currentSkipMarkers = createEmptySkipMarkers();
      currentSkipMarkerLookupStatus = 'error';
      renderSkipMarkerState('error', currentSkipMarkers);
      return currentSkipMarkers;
    } finally {
      if (requestSequence === skipMarkerRequestSequence) currentSkipMarkerLookupPromise = null;
    }
  })();

  currentSkipMarkerLookupPromise = lookupPromise;
  return lookupPromise;
}

function convertSkipMarkers(dbMarkers) {
  const skip_markers = createEmptySkipMarkers();

  const convertArray = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(marker => {
      // TheIntroDB returns start_ms/end_ms, the server expects start/end in seconds
      const startSec = typeof marker.start === 'number' ? marker.start : (marker.start_ms / 1000.0 || 0.0);
      const endSec = typeof marker.end === 'number' ? marker.end : (marker.end_ms / 1000.0 || 0.0);
      return {
        start: parseFloat(startSec.toFixed(2)),
        end: parseFloat(endSec.toFixed(2))
      };
    });
  };

  if (dbMarkers) {
    skip_markers.intro = convertArray(dbMarkers.intro);
    skip_markers.recap = convertArray(dbMarkers.recap);
    skip_markers.credits = convertArray(dbMarkers.credits);
    skip_markers.preview = convertArray(dbMarkers.preview);
  }

  return skip_markers;
}

function formatLocalPathToServerUrl(inputPath) {
  if (!inputPath) return '';
  const trimmed = inputPath.trim();
  if (trimmed.toLowerCase().startsWith('http://') || trimmed.toLowerCase().startsWith('https://')) {
    return trimmed;
  }

  // Strip file:/// if present
  let cleanPath = trimmed;
  if (cleanPath.toLowerCase().startsWith('file:///')) {
    cleanPath = cleanPath.substring(8);
  }

  // Look for /media/ or \media\ to extract relative path under media directory
  const mediaIndex = cleanPath.toLowerCase().replace(/\\/g, '/').indexOf('/media/');
  if (mediaIndex !== -1) {
    const relativePart = cleanPath.substring(mediaIndex + 7).replace(/\\/g, '/');
    return `${savedServerUrl}/media/${relativePart}`;
  }

  // If it's a relative path or doesn't have a drive letter/absolute prefix, assume it is under media
  if (!cleanPath.includes(':') && !cleanPath.startsWith('/') && !cleanPath.startsWith('\\')) {
    return `${savedServerUrl}/media/${cleanPath.replace(/\\/g, '/')}`;
  }

  // If it's an absolute path outside media folder, fallback to serving from media/Movies/ or media/
  // by grabbing the filename and placing it under media/
  const parts = cleanPath.split(/[\\/]/);
  const filename = parts[parts.length - 1];
  // Determine if it's a subtitle
  const isSubtitle = cleanPath.toLowerCase().endsWith('.vtt') || cleanPath.toLowerCase().endsWith('.srt');
  if (isSubtitle) {
    return `${savedServerUrl}/media/Subtitles/${filename}`;
  }
  return `${savedServerUrl}/media/Movies/${filename}`;
}

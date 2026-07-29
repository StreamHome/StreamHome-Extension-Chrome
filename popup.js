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

// Create Task search variables
let selectedTmdbId = null;
let selectedTitle = '';
let selectedContentType = 'movie';
let selectedQuality = '';
let availableStreams = {};
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
let pageAuth, pageDashboard, pageCreateTask, pageTaskStreams, pagePlayerDeploy, pageTvDetails;
let inputServerUrl, inputApiKey, inputTmdbApiKey, btnVerifyConnect;
let btnDashboardSettings, btnCreateTask, tasksContainer, dashboardEmptyState;
let inputTaskSearch, tmdbSuggestions, taskTypeIndicatorWrapper, taskTypeIndicator;
let btnCancelTask, btnSaveTask;
let btnStreamsBack, streamsPageTitle, streamsPageMeta, btnStreamsActivate, streamsListContainer;
let btnTvBack, tvShowTitle, tvShowMeta, tvSeasonsContainer, tvEpisodesContainer;
let streamsFooter, btnDeployTagged;

let btnPlayerBack, playerPageTitle, playerPageMeta, displayStreamUrl;
let playerMetaTmdb, playerMetaType;
let btnDeployServer, btnDownloadStream, btnPreviewStream, iconDeployState, textDeployState;
let qualitySelector, languageSelector, audioSelector, audioSelectorWrapper, subtitlesWrapper, subtitlesList;
let deploySeasonInput, deployEpisodeInput, deployEpisodicInputsWrapper;
let customVideoInput, customAudioInput;
let skipMarkersPanel, skipMarkersStatus, skipMarkersList, btnRetrySkipMarkers;
let manualSkipMarkersEditor, manualSkipMarkerType, manualSkipMarkerStart, manualSkipMarkerEnd;
let btnAddManualSkipMarker, manualSkipMarkersHint, manualSkipMarkersError, manualSkipMarkersList;

// Custom Records Cached variables
let btnCustomRecordsNav, pageCustomRecords, customRecordsListContainer, customRecordsEmptyState, btnCustomRecordsBack;
let inputCustomSubUrl, inputCustomSubLang, btnAddCustomSub;
let editingRecordId = null;

// Create Custom Record elements
let btnCustomRecordsAdd, modalCreateCustomRecord, inputCreateRecordName, inputCreateRecordSearch;
let createRecordTmdbSuggestions, createRecordTypeWrapper, createRecordTypeIndicator;
let btnModalCreateCancel, btnModalCreateSave;
let selectedCreateTmdbId = null, selectedCreateTitle = '', selectedCreateType = '';
let createSearchDebounceTimer;



document.addEventListener('DOMContentLoaded', () => {
  errorToast = document.getElementById('error-toast');
  errorMessage = document.getElementById('error-message');
  closeToast = document.getElementById('close-toast');

  pageAuth = document.getElementById('page-auth');
  pageDashboard = document.getElementById('page-dashboard');
  pageCreateTask = document.getElementById('page-create-task');
  pageTaskStreams = document.getElementById('page-task-streams');
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

  btnStreamsBack = document.getElementById('btn-streams-back');
  streamsPageTitle = document.getElementById('streams-page-title');
  streamsPageMeta = document.getElementById('streams-page-meta');
  btnStreamsActivate = document.getElementById('btn-streams-activate');
  streamsListContainer = document.getElementById('streams-list-container');
  streamsFooter = document.getElementById('streams-footer');
  btnDeployTagged = document.getElementById('btn-deploy-tagged');

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

  btnCustomRecordsNav = document.getElementById('btn-custom-records-nav');
  pageCustomRecords = document.getElementById('page-custom-records');
  customRecordsListContainer = document.getElementById('custom-records-list-container');
  customRecordsEmptyState = document.getElementById('custom-records-empty-state');
  btnCustomRecordsBack = document.getElementById('btn-custom-records-back');



  inputCustomSubUrl = document.getElementById('input-custom-sub-url');
  inputCustomSubLang = document.getElementById('input-custom-sub-lang');
  btnAddCustomSub = document.getElementById('btn-add-custom-sub');

  btnCustomRecordsAdd = document.getElementById('btn-custom-records-add');
  modalCreateCustomRecord = document.getElementById('modal-create-custom-record');
  inputCreateRecordName = document.getElementById('input-create-record-name');
  inputCreateRecordSearch = document.getElementById('input-create-record-search');
  createRecordTmdbSuggestions = document.getElementById('create-record-tmdb-suggestions');
  createRecordTypeWrapper = document.getElementById('create-record-type-wrapper');
  createRecordTypeIndicator = document.getElementById('create-record-type-indicator');
  btnModalCreateCancel = document.getElementById('btn-modal-create-cancel');
  btnModalCreateSave = document.getElementById('btn-modal-create-save');

  if (closeToast) closeToast.addEventListener('click', hideToast);
  if (inputServerUrl) inputServerUrl.addEventListener('input', (e) => chrome.storage.local.set({ draftServerUrl: e.target.value }));
  if (inputApiKey) inputApiKey.addEventListener('input', (e) => chrome.storage.local.set({ draftApiKey: e.target.value }));
  if (inputTmdbApiKey) inputTmdbApiKey.addEventListener('input', (e) => chrome.storage.local.set({ draftTmdbApiKey: e.target.value }));
  if (btnVerifyConnect) btnVerifyConnect.addEventListener('click', verifyAndConnect);
  if (btnDashboardSettings) btnDashboardSettings.addEventListener('click', disconnectCredentials);
  if (btnCreateTask) btnCreateTask.addEventListener('click', openCreateTaskPanel);
  if (btnCancelTask) btnCancelTask.addEventListener('click', cancelCreateTask);
  if (btnSaveTask) btnSaveTask.addEventListener('click', saveNewTask);
  if (btnStreamsBack) btnStreamsBack.addEventListener('click', navigateBackFromStreams);
  if (btnTvBack) btnTvBack.addEventListener('click', onTvBackClick);
  if (btnDeployTagged) btnDeployTagged.addEventListener('click', onDeployTaggedClick);
  if (btnPlayerBack) btnPlayerBack.addEventListener('click', navigateBackToStreams);
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
  if (btnCustomRecordsNav) btnCustomRecordsNav.addEventListener('click', () => switchView('customRecords'));
  if (btnCustomRecordsBack) btnCustomRecordsBack.addEventListener('click', () => switchView('dashboard'));

  if (btnAddCustomSub) btnAddCustomSub.addEventListener('click', addCustomSubtitleTrack);
  if (btnCustomRecordsAdd) btnCustomRecordsAdd.addEventListener('click', openCreateCustomRecordModal);
  if (btnModalCreateCancel) btnModalCreateCancel.addEventListener('click', closeCreateCustomRecordModal);
  if (btnModalCreateSave) btnModalCreateSave.addEventListener('click', saveNewCustomRecord);
  if (qualitySelector) qualitySelector.addEventListener('change', (e) => onQualityChange(e.target.value));
  if (audioSelector) {
    audioSelector.addEventListener('change', (e) => {
      selectedAudioUrl = e.target.value;
      persistDeploymentDraft();
    });
  }
  if (languageSelector) languageSelector.addEventListener('change', persistDeploymentDraft);
  if (customVideoInput) customVideoInput.addEventListener('input', persistDeploymentDraft);
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalCreateCustomRecord && !modalCreateCustomRecord.classList.contains('hidden')) {
      closeCreateCustomRecordModal();
    }
  });


  initAutocompleteSearch();
  initCreateRecordSearch();

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
        } else if (activeView === 'taskStreams') {
          const currentTask = scannedTasks.find(t => t.id == currentTaskId);
          if (currentTask) {
            chrome.storage.local.get(['learned_patterns'], (pRes) => {
              const renderTask = getScopedTaskForRendering(currentTask);
              renderGroupedStreams(renderTask, pRes.learned_patterns);
            });
          }
        }
      }
      if (changes.activeTaskId) {
        activeTaskId = changes.activeTaskId.newValue || null;
        if (activeView === 'dashboard') {
          renderDashboardTasks();
        } else if (activeView === 'taskStreams') {
          const isActive = (currentTaskId == activeTaskId);
          updateStreamsActivateButton(isActive);
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
    taskStreams: pageTaskStreams,
    playerDeploy: pagePlayerDeploy,
    tvDetails: pageTvDetails,
    customRecords: pageCustomRecords
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
  } else if (target === 'taskStreams') {
    loadTaskStreamsPage();
  } else if (target === 'customRecords') {
    loadCustomRecordsPage();
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

function hashDeploymentIdentity(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function getTaskDeploymentKey(task, streamUrl) {
  const season = task && task.type === 'series' ? (task.season ?? task.activeSeason ?? '-') : '-';
  const episode = task && task.type === 'series' ? (task.episode ?? task.activeEpisode ?? '-') : '-';
  return `task:${task ? task.type : 'unknown'}:${task ? task.id : 'unknown'}:${season}:${episode}:${hashDeploymentIdentity(streamUrl)}`;
}

function getCustomRecordDeploymentKey(recordId) {
  return `customRecord:${recordId}`;
}

function getDeploymentDraftStorageKey(contextKey) {
  return `${DEPLOYMENT_DRAFT_PREFIX}${contextKey}`;
}

function getSelectedSubtitleUrls() {
  if (!subtitlesList) return [];
  return Array.from(subtitlesList.querySelectorAll('input[type="checkbox"]:checked')).map((checkbox) => checkbox.value);
}

function getSerializableSubtitles() {
  return (availableSubtitles || [])
    .filter((subtitle) => subtitle && subtitle.url)
    .map((subtitle) => ({
      url: subtitle.url,
      lang: subtitle.lang || subtitle.language || 'en',
      language: subtitle.language || subtitle.lang || 'en',
      label: subtitle.label || subtitle.lang || subtitle.language || 'Subtitle'
    }));
}

function collectDeploymentDraft() {
  if (!activeDeploymentKey || !currentTaskContext) return null;

  const selectedAudio = audioSelector ? audioSelector.value : (selectedAudioUrl || '');
  const quality = qualitySelector ? qualitySelector.value : selectedQuality;

  return {
    version: 2,
    kind: editingRecordId ? 'customRecord' : 'task',
    contextKey: activeDeploymentKey,
    taskId: editingRecordId ? null : (currentTaskId ?? currentTaskContext.id),
    recordId: editingRecordId || null,
    currentStreamItem: currentStreamItem || null,
    selectedStreamUrl: selectedStreamUrl || '',
    selectedAudioUrl: selectedAudio || '',
    selectedQuality: quality || 'Unknown',
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

    if (qualitySelector) {
      addSelectOptionIfMissing(qualitySelector, draft.selectedQuality);
      qualitySelector.value = draft.selectedQuality || qualitySelector.value;
      selectedQuality = qualitySelector.value || 'Unknown';
    }

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
        checkbox.checked = selectedSubtitleUrls.has(checkbox.value);
      });
    }

    if (displayStreamUrl) {
      displayStreamUrl.textContent = selectedStreamUrl || 'No video source specified yet. Please enter a custom video path/URL below.';
    }
  } finally {
    isRestoringDeploymentDraft = false;
  }
}

function restorePlayerDeployView(state) {
  const restoreFromDraft = (draft) => {
    if (draft && draft.kind === 'customRecord' && draft.recordId) {
      chrome.storage.local.get(['custom_records'], (recordResult) => {
        const records = recordResult.custom_records || [];
        const record = records.find((item) => item.id == draft.recordId);
        if (record) {
          openCustomRecordInDeployPage(record, draft);
        } else {
          switchView('customRecords');
        }
      });
      return;
    }

    const taskId = draft && draft.taskId != null ? draft.taskId : state.currentTaskId;
    chrome.storage.local.get(['scanned_tasks'], (taskResult) => {
      const tasks = taskResult.scanned_tasks || [];
      const task = tasks.find((item) => item.id == taskId);
      let streamItem = draft && draft.currentStreamItem ? draft.currentStreamItem : state.currentStreamItem;
      if (!streamItem && draft && draft.selectedStreamUrl) {
        streamItem = {
          videoUrl: draft.selectedStreamUrl,
          label: 'Saved selection',
          quality: draft.selectedQuality || 'Unknown'
        };
      }

      if (!task || !streamItem) {
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

      currentStreamItem = streamItem;
      selectedStreamUrl = draft && typeof draft.selectedStreamUrl === 'string' ? draft.selectedStreamUrl : state.selectedStreamUrl;
      selectedAudioUrl = draft && typeof draft.selectedAudioUrl === 'string' ? draft.selectedAudioUrl : state.selectedAudioUrl;
      openPlayerDeployPage(renderTask, streamItem, rawUrls, null, draft || null);
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
        switchView('taskStreams');
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

function toggleFavorite(taskId, url) {
  chrome.storage.local.get(['scanned_tasks', 'learned_patterns'], (result) => {
    const tasks = result.scanned_tasks || [];
    let patterns = result.learned_patterns || { video_patterns: [], audio_patterns: [], favorite_patterns: [] };
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

    const sig = getStreamSignature(url);
    if (sig) {
      if (isAdding) {
        if (!patterns.favorite_patterns.includes(sig)) patterns.favorite_patterns.push(sig);
      } else {
        patterns.favorite_patterns = patterns.favorite_patterns.filter(p => p !== sig);
      }
    }
    chrome.storage.local.set({ scanned_tasks: tasks, learned_patterns: patterns });
  });
}

function toggleTaggedVideo(taskId, url) {
  chrome.storage.local.get(['scanned_tasks', 'learned_patterns'], (result) => {
    const tasks = result.scanned_tasks || [];
    let patterns = result.learned_patterns || { video_patterns: [], audio_patterns: [], favorite_patterns: [] };
    const taskIndex = tasks.findIndex(t => t.id == taskId);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    let isAdding = false;
    let oldUrl = null;

    if (task.type === 'series') {
      const season = task.activeSeason || 1;
      const episode = task.activeEpisode || 1;
      const epKey = `${season}x${episode}`;
      task.episodes = task.episodes || {};
      task.episodes[epKey] = task.episodes[epKey] || { rawStreams: [] };
      const epData = task.episodes[epKey];
      if (epData.taggedVideoUrl === url) {
        epData.taggedVideoUrl = null;
      } else {
        oldUrl = epData.taggedVideoUrl;
        epData.taggedVideoUrl = url;
        isAdding = true;
      }
    } else {
      if (task.taggedVideoUrl === url) {
        task.taggedVideoUrl = null;
      } else {
        oldUrl = task.taggedVideoUrl;
        task.taggedVideoUrl = url;
        isAdding = true;
      }
    }

    const sig = getStreamSignature(url);
    if (sig) {
      if (isAdding) {
        if (!patterns.video_patterns.includes(sig)) patterns.video_patterns.push(sig);
        if (oldUrl) {
           const oldSig = getStreamSignature(oldUrl);
           if (oldSig) patterns.video_patterns = patterns.video_patterns.filter(p => p !== oldSig);
        }
      } else {
        patterns.video_patterns = patterns.video_patterns.filter(p => p !== sig);
      }
    }
    chrome.storage.local.set({ scanned_tasks: tasks, learned_patterns: patterns });
  });
}

function toggleTaggedAudio(taskId, url) {
  chrome.storage.local.get(['scanned_tasks', 'learned_patterns'], (result) => {
    const tasks = result.scanned_tasks || [];
    let patterns = result.learned_patterns || { video_patterns: [], audio_patterns: [], favorite_patterns: [] };
    const taskIndex = tasks.findIndex(t => t.id == taskId);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    let isAdding = false;
    let oldUrl = null;

    if (task.type === 'series') {
      const season = task.activeSeason || 1;
      const episode = task.activeEpisode || 1;
      const epKey = `${season}x${episode}`;
      task.episodes = task.episodes || {};
      task.episodes[epKey] = task.episodes[epKey] || { rawStreams: [] };
      const epData = task.episodes[epKey];
      if (epData.taggedAudioUrl === url) {
        epData.taggedAudioUrl = null;
      } else {
        oldUrl = epData.taggedAudioUrl;
        epData.taggedAudioUrl = url;
        isAdding = true;
      }
    } else {
      if (task.taggedAudioUrl === url) {
        task.taggedAudioUrl = null;
      } else {
        oldUrl = task.taggedAudioUrl;
        task.taggedAudioUrl = url;
        isAdding = true;
      }
    }

    const sig = getStreamSignature(url);
    if (sig) {
      if (isAdding) {
        if (!patterns.audio_patterns.includes(sig)) patterns.audio_patterns.push(sig);
        if (oldUrl) {
           const oldSig = getStreamSignature(oldUrl);
           if (oldSig) patterns.audio_patterns = patterns.audio_patterns.filter(p => p !== oldSig);
        }
      } else {
        patterns.audio_patterns = patterns.audio_patterns.filter(p => p !== sig);
      }
    }
    chrome.storage.local.set({ scanned_tasks: tasks, learned_patterns: patterns });
  });
}

function findStreamItem(task, url) {
  if (!url) return null;
  
  let rawUrls = [];
  if (task.type === 'series') {
    const season = task.activeSeason || 1;
    const episode = task.activeEpisode || 1;
    const epKey = `${season}x${episode}`;
    if (task.episodes && task.episodes[epKey]) {
      rawUrls = task.episodes[epKey].rawStreams || [];
    }
  } else {
    rawUrls = task.rawStreams || [];
  }
  
  const { video, audio } = processRawStreams(rawUrls, task);
  
  // Search in video categories
  for (const res in video) {
    const found = video[res].find(item => (item.videoUrl || item.audioUrl) === url);
    if (found) return found;
  }
  
  // Search in audio
  const foundAudio = audio.find(item => (item.videoUrl || item.audioUrl) === url);
  if (foundAudio) return foundAudio;
  
  return null;
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
    chrome.storage.local.set({ scanned_tasks: tasks }, () => { switchView('dashboard'); });
  });
}

function navigateBackToDashboard() { switchView('dashboard'); }

function getScopedTaskForRendering(task) {
  if (!task) return null;
  if (task.type !== 'series') return task;

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

function loadTaskStreamsPage() {
  chrome.storage.local.get(['scanned_tasks', 'activeTaskId', 'learned_patterns'], (result) => {
    const tasks = result.scanned_tasks || [];
    activeTaskId = result.activeTaskId || null;

    const task = tasks.find(t => t.id == currentTaskId);
    if (!task) { switchView('dashboard'); return; }

    streamsPageTitle.textContent = task.title;
    let metaText = `TMDB: ${task.id} · TYPE: ${task.type.toUpperCase()}`;
    
    if (task.type === 'series') {
      const season = task.activeSeason || 1;
      const episode = task.activeEpisode || 1;
      metaText += ` · S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`;
    }
    streamsPageMeta.textContent = metaText;

    const isActive = (task.id == activeTaskId);
    updateStreamsActivateButton(isActive);

    btnStreamsActivate.onclick = () => { toggleActiveSessionInStreams(task.id); };
    
    const renderTask = getScopedTaskForRendering(task);
    renderGroupedStreams(renderTask, result.learned_patterns);
  });
}

function updateStreamsActivateButton(isActive) {
  if (!btnStreamsActivate) return;
  btnStreamsActivate.dataset.active = isActive ? 'true' : 'false';
  btnStreamsActivate.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  if (isActive) {
    btnStreamsActivate.className = 'ember-state-toggle flex-shrink-0 px-2.5 py-1 focus:outline-none';
    btnStreamsActivate.textContent = 'Listening';
  } else {
    btnStreamsActivate.className = 'ember-state-toggle flex-shrink-0 px-2.5 py-1 focus:outline-none';
    btnStreamsActivate.textContent = 'Start listening';
  }
}

function toggleActiveSessionInStreams(id) {
  const newActiveId = (activeTaskId == id) ? null : id;
  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const tasks = result.scanned_tasks || [];
    if (newActiveId === null) {
      chrome.action.setBadgeText({ text: '' });
      chrome.storage.local.set({ activeTaskId: null, activeTabId: null }, () => {
        activeTaskId = null;
        updateStreamsActivateButton(false);
      });
    } else {
      const activeTask = tasks.find(t => t.id == newActiveId);
      let streamsCount = 0;
      if (activeTask) {
        if (activeTask.type === 'series') {
          const season = activeTask.activeSeason || 1;
          const episode = activeTask.activeEpisode || 1;
          const epKey = `${season}x${episode}`;
          streamsCount = (activeTask.episodes && activeTask.episodes[epKey] && activeTask.episodes[epKey].rawStreams)
            ? activeTask.episodes[epKey].rawStreams.length
            : 0;
        } else {
          streamsCount = activeTask.rawStreams ? activeTask.rawStreams.length : 0;
        }
      }
      chrome.action.setBadgeText({ text: streamsCount > 0 ? streamsCount.toString() : '0' });
      chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0] ? tabs[0].id : null;
        chrome.storage.local.set({ activeTaskId: newActiveId, activeTabId: activeTabId }, () => {
          activeTaskId = newActiveId;
          updateStreamsActivateButton(true);
        });
      });
    }
  });
}

// Akıllı Çözünürlük ve Format Yakalama Helper'ı
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
            return { url, lang: code, label: getSubtitleLanguageName(code) };
        }
    }

    return { url, lang: 'unknown', label: getSubtitleLanguageName('unknown') };
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

function renderGroupedStreams(task, patterns = {}) {
  if (!streamsListContainer) return;
  streamsListContainer.innerHTML = '';
  
  const rawUrls = task.rawStreams || [];
  if (rawUrls.length === 0) {
    streamsListContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center p-6 bg-[#1E293B]/20 rounded-xl border border-slate-800 border-dashed py-12">
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
  const videoPatterns = patterns.video_patterns || [];
  const audioPatterns = patterns.audio_patterns || [];

  // Filter and extract favorites and recommendations from video streams
  for (const res in itemsByRes) {
    itemsByRes[res] = itemsByRes[res].filter(item => {
      const targetUrl = item.videoUrl || item.audioUrl;
      const isTagged = (task.taggedVideoUrl === targetUrl) || (task.taggedAudioUrl === targetUrl);
      
      const isRecommended = isTagged;

      if (favoritesList.includes(targetUrl)) {
        favoriteItems.push(item);
        return false; // remove from original category
      }
      if (isRecommended) {
        recommendedItems.push(item);
        return false; // remove from original category
      }
      return true;
    });
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
      mirrorCard.className = 'group relative flex flex-col justify-between bg-[#1E293B] border border-slate-800/80 hover:border-cyan-500/50 p-3 rounded-lg cursor-pointer hover:shadow-lg transition-all duration-200';
      const targetUrl = item.videoUrl || item.audioUrl;
      const isFavorite = favoritesList.includes(targetUrl);

      const isVideoTagged = (task.taggedVideoUrl === targetUrl);
      const isAudioTagged = (task.taggedAudioUrl === targetUrl);

      const starSvg = isFavorite 
        ? `<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>`
        : `<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.969 0 1.371 1.24.588 1.81l-3.97 2.883a1 1 0 00-.364 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.971-2.883a1 1 0 00-1.18 0l-3.97 2.883c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.364-1.118L2.98 9.42c-.783-.57-.38-1.81.588-1.81h4.906a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;

      mirrorCard.innerHTML = `
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Mirror Source #${index + 1}</span>
          <div class="flex items-center gap-1">
            <button class="stream-action stream-action--video btn-tag-video ${isVideoTagged ? 'is-active' : ''} focus:outline-none" aria-label="${isVideoTagged ? 'Remove video tag' : 'Use as video source'}" title="${isVideoTagged ? 'Remove Video Tag' : 'Set as Video Source'}">
              <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
            <button class="stream-action stream-action--audio btn-tag-audio ${isAudioTagged ? 'is-active' : ''} focus:outline-none" aria-label="${isAudioTagged ? 'Remove audio tag' : 'Use as audio source'}" title="${isAudioTagged ? 'Remove Audio Tag' : 'Set as Audio Source'}">
              <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            </button>
            <div class="w-px h-3 bg-slate-700 mx-0.5"></div>
            <button class="stream-action stream-action--favorite btn-favorite-stream ${isFavorite ? 'is-active' : ''} focus:outline-none" aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}" title="${isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}">
              ${starSvg}
            </button>
            <button class="stream-action stream-action--danger btn-delete-stream focus:outline-none" aria-label="Delete captured source" title="Delete Captured Record">
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

      const btnVideo = mirrorCard.querySelector('.btn-tag-video');
      btnVideo.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaggedVideo(task.id, targetUrl);
      });

      const btnAudio = mirrorCard.querySelector('.btn-tag-audio');
      btnAudio.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaggedAudio(task.id, targetUrl);
      });

      const btnDel = mirrorCard.querySelector('.btn-delete-stream');
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteStreamRecord(task.id, targetUrl);
      });

      mirrorCard.addEventListener('click', () => { openPlayerDeployPage(task, item, rawUrls); });
      makeKeyboardActivatable(mirrorCard, () => { openPlayerDeployPage(task, item, rawUrls); }, `Review ${item.label}`);
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

    streamsListContainer.appendChild(accordion);
  });
  updateDeployTaggedFooter(task, rawUrls);
}

function updateDeployTaggedFooter(task, rawUrls) {
  if (!streamsFooter || !btnDeployTagged) return;
  if (task.taggedVideoUrl || task.taggedAudioUrl) {
    streamsFooter.classList.remove('hidden');
    // Store current task and urls globally so onDeployTaggedClick can access them
    currentTaskContext = task;
    availableStreams = rawUrls; // reuse variable
  } else {
    streamsFooter.classList.add('hidden');
  }
}

function onDeployTaggedClick() {
  if (!currentTaskContext) return;
  const videoUrl = currentTaskContext.taggedVideoUrl;
  const audioUrl = currentTaskContext.taggedAudioUrl;
  if (!videoUrl && !audioUrl) return;

  const videoItem = findStreamItem(currentTaskContext, videoUrl);
  const audioItem = findStreamItem(currentTaskContext, audioUrl);

  // If only audio is tagged, we fallback to the audioUrl as the videoUrl (dummy), but ideally video is tagged.
  const fallbackUrl = audioUrl || '';
  const dummyVideo = videoItem || { 
    videoUrl: fallbackUrl, 
    label: 'No Video Selected',
    quality: 'Unknown'
  };

  openPlayerDeployPage(currentTaskContext, dummyVideo, availableStreams, audioItem);
}

async function navigateBackToStreams() {
  if (editingRecordId) {
    await saveCustomRecordWithoutModal();
    switchView('customRecords');
  } else {
    switchView('taskStreams');
  }
}

function openPlayerDeployPage(task, selectedItem, rawUrls, audioItem = null, restoredDraft = undefined) {
  editingRecordId = null;
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

  // Set the selected stream URL and don't change it.
  currentStreamItem = selectedItem;
  selectedStreamUrl = selectedItem.videoUrl || selectedItem.audioUrl || '';
  const preferredAudioUrl = audioItem ? (audioItem.videoUrl || audioItem.audioUrl || '') : '';
  activeDeploymentKey = getTaskDeploymentKey(task, selectedStreamUrl);

  playerPageTitle.textContent = task.title;
  // Update UI with the clicked stream's info
  playerPageMeta.textContent = selectedItem.label;
  displayStreamUrl.textContent = selectedStreamUrl;

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

  populateQualitySelector(selectedStreamUrl, task);
  
  if (qualitySelector.options.length > 0) {
    const initialQuality = String(selectedItem.quality || 'Unknown');
    let matchingIndex = -1;
    for (let i = 0; i < qualitySelector.options.length; i++) {
      if (qualitySelector.options[i].value.toLowerCase().includes(initialQuality.toLowerCase())) {
        matchingIndex = i;
        break;
      }
    }
    if (matchingIndex !== -1) {
      qualitySelector.selectedIndex = matchingIndex;
    } else {
      qualitySelector.selectedIndex = 0;
    }
    selectedQuality = qualitySelector.value;
  } else {
    selectedQuality = 'Unknown';
  }

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
    applyDeploymentDraft(draft);
    switchView('playerDeploy');
    persistDeploymentDraft();
    fetchSkipMarkersForDeployment({ force: true });
  };

  if (restoredDraft !== undefined) {
    finishOpening(restoredDraft);
  } else {
    loadDeploymentDraft(deploymentKey, finishOpening);
  }
}

function populateQualitySelector(url, task) {
    qualitySelector.innerHTML = '';
    let qualities = ['4K (2160p)', '1080p', '720p', '480p', '360p', 'HLS / M3U8', 'DASH / MPD', 'Progressive MP4', 'Unknown'];
    
    if (task && task.streamQualities && task.streamQualities[url]) {
      const list = task.streamQualities[url];
      if (list && list.length > 0) {
        qualities = list;
      }
    }

    qualities.forEach(q => {
        const option = document.createElement('option');
        option.value = q;
        option.textContent = q;
        qualitySelector.appendChild(option);
    });
}

function onQualityChange(quality) {
    selectedQuality = quality;
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

function populateSubtitles() {
    if (!subtitlesList || !subtitlesWrapper) return;
    subtitlesList.innerHTML = '';
    if (availableSubtitles.length > 0) {
        subtitlesWrapper.classList.remove('hidden');
        availableSubtitles.forEach((sub, index) => {
            const lang = sub.lang || sub.language || 'en';
            const languageName = getSubtitleLanguageName(lang);
            const id = `sub-checkbox-${index}`;
            const checkboxWrapper = document.createElement('div');
            checkboxWrapper.className = 'subtitle-track-row';

            const checkbox = document.createElement('input');
            checkbox.id = id;
            checkbox.type = 'checkbox';
            checkbox.value = sub.url;
            checkbox.dataset.lang = lang;
            checkbox.className = 'subtitle-track-checkbox';

            const label = document.createElement('label');
            label.htmlFor = id;
            label.className = 'subtitle-track-label';
            label.title = sub.url;

            const languageText = document.createElement('span');
            languageText.className = 'subtitle-track-language';
            languageText.textContent = languageName;

            const languageCode = document.createElement('span');
            languageCode.className = 'subtitle-track-code';
            languageCode.textContent = String(lang || 'unknown').toUpperCase();

            label.append(languageText, languageCode);
            
            const rightSide = document.createElement('button');
            rightSide.type = 'button';
            rightSide.className = 'ember-inline-action subtitle-track-read';
            rightSide.textContent = 'Read';
            rightSide.setAttribute('aria-label', `Read ${languageName} subtitles`);
            rightSide.addEventListener('click', (e) => {
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
            checkboxWrapper.append(checkbox, label, rightSide);
            
            subtitlesList.appendChild(checkboxWrapper);
        });
    } else {
        subtitlesWrapper.classList.add('hidden');
    }
}

function resetDeployButtonState() {
  if (!btnDeployServer) return;
  btnDeployServer.disabled = false;
  btnDeployServer.dataset.state = 'idle';
  btnDeployServer.className = 'ember-primary flex-1 py-2.5 px-3 flex items-center justify-center gap-1.5';
  iconDeployState.innerHTML = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
  `;
  textDeployState.textContent = 'Send to StreamHome';
}

function onPreviewClick() {
  const targetUrl = selectedStreamUrl || selectedAudioUrl;
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
  const targetUrl = selectedStreamUrl || selectedAudioUrl;
  if (!targetUrl) { displayError('No active stream URL selected.'); return; }
  chrome.downloads.download({ url: targetUrl }, (downloadId) => {
    const error = chrome.runtime.lastError;
    if (error) displayError(`Download failed: ${error.message}`);
  });
}

async function deployMetadataPayload() {
  if (editingRecordId) {
    await saveCustomRecordWithoutModal();
  }

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
    const subtitleCheckboxes = subtitlesList.querySelectorAll('input[type="checkbox"]:checked');
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
    quality: (selectedQuality && selectedQuality !== 'Unknown') ? selectedQuality : '1080p',
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

    setTimeout(() => {
      if (editingRecordId) {
        switchView('customRecords');
      } else {
        switchView('taskStreams');
      }
    }, 1200);
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
      switchView('taskStreams');
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

function deleteStreamRecord(taskId, url) {
  chrome.storage.local.get(['scanned_tasks'], (result) => {
    const tasks = result.scanned_tasks || [];
    const taskIndex = tasks.findIndex(t => t.id == taskId);
    if (taskIndex === -1) return;

    const task = tasks[taskIndex];
    
    const removeFromArray = (arr, val) => {
      if (!arr) return;
      const index = arr.indexOf(val);
      if (index !== -1) arr.splice(index, 1);
    };

    if (task.type === 'series') {
      const season = task.activeSeason || 1;
      const episode = task.activeEpisode || 1;
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

    chrome.storage.local.set({ scanned_tasks: tasks });
  });
}

// ==================== CUSTOM RECORDS SYSTEM ====================

function loadCustomRecordsPage() {
  chrome.storage.local.get(['custom_records'], (result) => {
    const records = result.custom_records || [];
    renderCustomRecords(records);
  });
}

function renderCustomRecords(records) {
  if (!customRecordsListContainer) return;
  customRecordsListContainer.innerHTML = '';

  if (records.length === 0) {
    if (customRecordsEmptyState) customRecordsEmptyState.style.display = 'flex';
    return;
  }

  if (customRecordsEmptyState) customRecordsEmptyState.style.display = 'none';

  records.forEach((record) => {
    const card = document.createElement('div');
    card.className = 'bg-[#1E293B] border border-slate-800 p-4 rounded-xl transition-all duration-200 hover:border-slate-700/80 flex flex-col gap-2 relative overflow-hidden group cursor-pointer';
    
    const episodicInfo = record.media_type === 'tv' ? ` · S${record.season} E${record.episode}` : '';
    const videoUrlDisplay = record.video_url || 'No Video Source';

    card.innerHTML = `
      <div class="flex items-center justify-between gap-4">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-lg bg-cyan-950/20 text-cyan-400 border border-cyan-800/30 flex items-center justify-center flex-shrink-0">
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </div>
          <div class="flex flex-col min-w-0">
            <span class="font-bold text-sm text-slate-100 truncate max-w-[210px] group-hover:text-cyan-300 transition-colors">${record.name}</span>
            <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">${record.title}${episodicInfo}</span>
          </div>
        </div>
        <button class="btn-delete-record ember-danger-icon p-1.5 focus:outline-none flex-shrink-0" title="Delete Record">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>
      <div class="text-[9px] font-mono text-cyan-300/80 truncate break-all bg-slate-900/40 p-2 rounded-md border border-slate-850/50 mt-1 leading-normal max-w-full">
        ${videoUrlDisplay}
      </div>
      <div class="flex flex-wrap gap-1.5 mt-1">
        <span class="text-[8px] font-extrabold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/40 capitalize">${record.media_type === 'tv' ? 'tv series' : 'movie'}</span>
        <span class="text-[8px] font-extrabold text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900/30 uppercase">${record.quality || 'unknown'}</span>
        <span class="text-[8px] font-extrabold text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/40 uppercase">${record.language || 'en'}</span>
        ${record.subtitles && record.subtitles.length > 0 ? `<span class="text-[8px] font-extrabold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/30 uppercase">${record.subtitles.length} Sub(s)</span>` : ''}
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-record')) return;
      openCustomRecordInDeployPage(record);
    });
    makeKeyboardActivatable(card, () => { openCustomRecordInDeployPage(record); }, `Open saved deployment ${record.name}`);

    const btnDel = card.querySelector('.btn-delete-record');
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCustomRecord(record.id);
    });

    customRecordsListContainer.appendChild(card);
  });
}

function deleteCustomRecord(id) {
  chrome.storage.local.get(['custom_records'], (result) => {
    let records = result.custom_records || [];
    records = records.filter(r => r.id != id);
    chrome.storage.local.set({ custom_records: records }, () => {
      loadCustomRecordsPage();
    });
  });
}

function openCustomRecordInDeployPage(record, restoredDraft = undefined) {
  editingRecordId = record.id;
  currentTaskId = null;
  currentStreamItem = null;
  activeDeploymentKey = getCustomRecordDeploymentKey(record.id);
  resetManualSkipMarkerEditor();

  // Setup mock task context
  currentTaskContext = {
    id: record.tmdb_id,
    title: record.title,
    type: record.media_type === 'tv' ? 'series' : 'movie',
    capturedHeaders: {}
  };

  selectedStreamUrl = record.video_url || '';
  selectedAudioUrl = record.audio_url || '';
  selectedQuality = record.quality || 'Unknown';
  availableAudios = [];
  availableVideos = {};

  // UI elements
  playerPageTitle.textContent = record.title;
  playerPageMeta.textContent = `Saved deployment · ${record.name}`;
  displayStreamUrl.textContent = selectedStreamUrl || 'No video source specified yet. Please enter a custom video path/URL below.';

  playerMetaTmdb.textContent = record.tmdb_id;
  playerMetaType.textContent = record.media_type;

  if (customVideoInput) customVideoInput.value = record.video_url || '';
  if (customAudioInput) customAudioInput.value = record.audio_url || '';
  if (inputCustomSubUrl) inputCustomSubUrl.value = '';
  if (inputCustomSubLang) inputCustomSubLang.value = '';

  populateLanguageSelector();
  populateQualitySelector(null, null);
  populateAudioSelector();

  if (qualitySelector) {
    // Make sure option exists or add it
    let exists = false;
    for (let i = 0; i < qualitySelector.options.length; i++) {
      if (qualitySelector.options[i].value === selectedQuality) exists = true;
    }
    if (!exists && selectedQuality) {
      const opt = document.createElement('option');
      opt.value = selectedQuality;
      opt.textContent = selectedQuality;
      qualitySelector.appendChild(opt);
    }
    qualitySelector.value = selectedQuality;
  }

  if (languageSelector) {
    languageSelector.value = record.language || 'en';
  }

  // Episodic controls
  if (record.media_type === 'tv') {
    if (deployEpisodicInputsWrapper) deployEpisodicInputsWrapper.classList.remove('hidden');
    if (deploySeasonInput) {
      deploySeasonInput.disabled = false;
      deploySeasonInput.classList.remove('bg-[#1E293B]/50', 'text-slate-500', 'cursor-not-allowed');
      deploySeasonInput.value = record.season ?? '';
    }
    if (deployEpisodeInput) {
      deployEpisodeInput.disabled = false;
      deployEpisodeInput.classList.remove('bg-[#1E293B]/50', 'text-slate-500', 'cursor-not-allowed');
      deployEpisodeInput.value = record.episode ?? '';
    }
  } else {
    if (deployEpisodicInputsWrapper) deployEpisodicInputsWrapper.classList.add('hidden');
  }

  // Populate subtitles checkboxes
  availableSubtitles = record.subtitles || [];
  populateSubtitles();
  // Check them all by default since they were saved to the record
  if (subtitlesList) {
    const checkboxes = subtitlesList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
  }

  resetDeployButtonState();
  const deploymentKey = activeDeploymentKey;
  const finishOpening = (draft) => {
    if (activeDeploymentKey !== deploymentKey) return;
    applyDeploymentDraft(draft);
    switchView('playerDeploy');
    persistDeploymentDraft();
    fetchSkipMarkersForDeployment({ force: true });
  };

  if (restoredDraft !== undefined) {
    finishOpening(restoredDraft);
  } else {
    loadDeploymentDraft(deploymentKey, finishOpening);
  }
}

function saveCustomRecordWithoutModal() {
  if (!editingRecordId) return Promise.resolve();

  const customVideo = customVideoInput ? customVideoInput.value.trim() : '';
  const customAudio = customAudioInput ? customAudioInput.value.trim() : '';

  const finalStreamUrl = customVideo || selectedStreamUrl;
  const finalAudioUrl = customAudio || (audioSelector ? audioSelector.value : '');

  const selectedLanguage = languageSelector ? languageSelector.value : 'en';
  const selectedSubtitles = [];
  if (subtitlesList) {
    const subtitleCheckboxes = subtitlesList.querySelectorAll('input[type="checkbox"]:checked');
    subtitleCheckboxes.forEach(checkbox => {
      const code = checkbox.dataset.lang || 'en';
      selectedSubtitles.push({
        lang: code,
        language: code,
        url: checkbox.value,
        label: code.toUpperCase()
      });
    });
  }

  const mediaType = playerMetaType ? playerMetaType.textContent : 'movie';
  let season = null;
  let episode = null;

  if (mediaType === 'tv' || mediaType === 'series') {
    if (deploySeasonInput) season = parseInt(deploySeasonInput.value, 10);
    if (deployEpisodeInput) episode = parseInt(deployEpisodeInput.value, 10);
    if (isNaN(season) || season === null || isNaN(episode) || episode === null) {
      season = 1;
      episode = 1;
    }
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(['custom_records'], (result) => {
      const records = result.custom_records || [];
      const idx = records.findIndex(r => r.id === editingRecordId);
      if (idx === -1) {
        resolve();
        return;
      }

      records[idx].video_url = finalStreamUrl;
      records[idx].audio_url = finalAudioUrl;
      records[idx].quality = selectedQuality || 'Unknown';
      records[idx].language = selectedLanguage;
      records[idx].subtitles = selectedSubtitles;
      records[idx].season = season;
      records[idx].episode = episode;

      chrome.storage.local.set({ custom_records: records }, resolve);
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
    label: getSubtitleLanguageName(lang)
  });

  populateSubtitles();

  // Clear inputs
  inputCustomSubUrl.value = '';
  inputCustomSubLang.value = '';

  // Check the newly added item (it should be the last item in subtitles-list)
  if (subtitlesList) {
    const checkboxes = subtitlesList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((checkbox, index) => {
      checkbox.checked = selectedSubtitleUrls.has(checkbox.value) || index === checkboxes.length - 1;
    });
  }
  persistDeploymentDraft();
}

// ==================== CREATE CUSTOM RECORD FLOW ====================

function openCreateCustomRecordModal() {
  if (!modalCreateCustomRecord) return;
  
  // Clear inputs
  if (inputCreateRecordName) inputCreateRecordName.value = '';
  if (inputCreateRecordSearch) inputCreateRecordSearch.value = '';
  if (createRecordTmdbSuggestions) {
    createRecordTmdbSuggestions.innerHTML = '';
    createRecordTmdbSuggestions.classList.add('hidden');
  }
  if (createRecordTypeWrapper) createRecordTypeWrapper.classList.add('hidden');
  
  selectedCreateTmdbId = null;
  selectedCreateTitle = '';
  selectedCreateType = '';
  
  modalCreateCustomRecord.classList.remove('hidden');
  if (inputCreateRecordName) inputCreateRecordName.focus();
}

function closeCreateCustomRecordModal() {
  if (modalCreateCustomRecord) modalCreateCustomRecord.classList.add('hidden');
}

function initCreateRecordSearch() {
  if (!inputCreateRecordSearch) return;
  inputCreateRecordSearch.addEventListener('input', () => {
    clearTimeout(createSearchDebounceTimer);
    const query = inputCreateRecordSearch.value.trim();
    if (query.length < 2) {
      createRecordTmdbSuggestions.innerHTML = '';
      createRecordTmdbSuggestions.classList.add('hidden');
      return;
    }
    createSearchDebounceTimer = setTimeout(() => { fetchCreateRecordSuggestions(query); }, 300);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== inputCreateRecordSearch && e.target !== createRecordTmdbSuggestions) {
      if (createRecordTmdbSuggestions) createRecordTmdbSuggestions.classList.add('hidden');
    }
  });
}

async function fetchCreateRecordSuggestions(query) {
  if (!savedTmdbApiKey) { displayError('TMDB API Key missing. Please reconnect credentials.'); return; }
  const url = `https://api.themoviedb.org/3/search/multi?api_key=${savedTmdbApiKey}&query=${encodeURIComponent(query)}&language=en-US`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(translateHttpStatus(response.status));
    const data = await response.json();
    renderCreateRecordSuggestions(data.results || []);
  } catch (err) {
    console.error("[DEBUG] TMDB Fetch Error:", err);
    displayError(err.message || 'Failed to search TMDB titles.');
  }
}

function renderCreateRecordSuggestions(results) {
  if (!createRecordTmdbSuggestions) return;
  createRecordTmdbSuggestions.innerHTML = '';

  const filtered = results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
  if (filtered.length === 0) {
    createRecordTmdbSuggestions.classList.add('hidden');
    return;
  }

  filtered.slice(0, 5).forEach(item => {
    const title = item.title || item.name || 'Unknown Title';
    const year = (item.release_date || item.first_air_date || '').split('-')[0];
    const yrStr = year ? ` (${year})` : '';
    const typeLabel = item.media_type === 'tv' ? 'TV' : 'Movie';

    const div = document.createElement('div');
    div.className = 'px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer border-b border-slate-850/60 last:border-0 truncate';
    div.innerHTML = `
      <div class="font-bold truncate">${title}${yrStr}</div>
      <div class="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">${typeLabel}</div>
    `;

    div.addEventListener('click', () => {
      selectCreateRecordItem(item, title);
    });

    createRecordTmdbSuggestions.appendChild(div);
  });

  createRecordTmdbSuggestions.classList.remove('hidden');
}

function selectCreateRecordItem(item, title) {
  selectedCreateTmdbId = item.id;
  selectedCreateTitle = title;
  selectedCreateType = item.media_type; // 'tv' or 'movie'

  if (createRecordTypeIndicator) {
    createRecordTypeIndicator.textContent = selectedCreateType === 'tv' ? 'TV / Series' : 'Movie';
  }
  if (createRecordTypeWrapper) {
    createRecordTypeWrapper.classList.remove('hidden');
  }
  if (createRecordTmdbSuggestions) {
    createRecordTmdbSuggestions.innerHTML = '';
    createRecordTmdbSuggestions.classList.add('hidden');
  }
  if (inputCreateRecordSearch) {
    inputCreateRecordSearch.value = title;
  }
}

function saveNewCustomRecord() {
  if (!inputCreateRecordName || !selectedCreateTmdbId || !selectedCreateTitle) {
    displayError('Please enter a record name and select a valid title from TMDB suggestions.');
    return;
  }

  const name = inputCreateRecordName.value.trim();
  if (!name) {
    displayError('Please specify a name for the custom record.');
    return;
  }

  chrome.storage.local.get(['custom_records'], (result) => {
    const records = result.custom_records || [];
    
    // Create new record with empty media fields but complete metadata
    const newRec = {
      id: 'rec_' + Date.now(),
      name: name,
      tmdb_id: selectedCreateTmdbId,
      title: selectedCreateTitle,
      media_type: selectedCreateType === 'tv' ? 'tv' : 'movie',
      season: 1, // default
      episode: 1, // default
      video_url: '',
      audio_url: '',
      quality: '1080p',
      language: 'en',
      subtitles: []
    };

    records.push(newRec);

    chrome.storage.local.set({ custom_records: records }, () => {
      closeCreateCustomRecordModal();
      loadCustomRecordsPage(); // refresh custom records page
    });
  });
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

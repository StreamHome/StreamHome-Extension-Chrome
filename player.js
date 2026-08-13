document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('video-player');
  const spinner = document.getElementById('video-spinner');
  
  const overlayTitle = document.getElementById('overlay-title');
  const engineBadge = document.getElementById('player-engine-badge');
  
  const specFormat = document.getElementById('spec-format');
  const specResolution = document.getElementById('spec-resolution');
  const specState = document.getElementById('spec-state');
  
  const headerReferer = document.getElementById('header-referer');
  const headerOrigin = document.getElementById('header-origin');
  const headerUserAgent = document.getElementById('header-useragent');
  
  const rawStreamUrl = document.getElementById('raw-stream-url');
  const logContainer = document.getElementById('player-logs');
  
  const btnCloseTab = document.getElementById('btn-close-tab');

  if (btnCloseTab) {
    btnCloseTab.addEventListener('click', () => {
      window.close();
    });
  }

  // Logger helper
  function log(message, type = 'info') {
    const logItem = document.createElement('div');
    let colorCls = 'text-slate-400';
    if (type === 'error') colorCls = 'text-rose-400 font-bold';
    else if (type === 'success') colorCls = 'text-emerald-450';
    else if (type === 'warning') colorCls = 'text-amber-450';
    
    logItem.className = colorCls;
    logItem.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(logItem);
    logContainer.scrollTop = logContainer.scrollHeight;
    console.log(`[Player] ${message}`);
  }

  // Parse query parameters
  const params = new URLSearchParams(window.location.search);
  const streamUrl = params.get('url');
  const title = params.get('title') || 'Stream Preview';
  const audioUrl = params.get('audioUrl') || '';
  const audioLanguage = (params.get('audioLanguage') || 'unknown').toLowerCase();
  const audioLabel = params.get('audioLabel') || 'Dubbing track';
  const headersReady = params.get('headersReady') === '1';
  
  const referer = params.get('referer');
  const origin = params.get('origin');
  const useragent = params.get('useragent');
  const audioReferer = params.get('audioReferer');
  const audioOrigin = params.get('audioOrigin');
  const audioUseragent = params.get('audioUseragent');

  if (!streamUrl) {
    log('No stream URL provided in query parameters.', 'error');
    specState.textContent = 'No Stream';
    specState.className = 'font-bold text-rose-500 mt-0.5 block';
    return;
  }

  overlayTitle.textContent = title;
  rawStreamUrl.textContent = streamUrl;
  
  headerReferer.textContent = headersReady ? 'Applied securely' : (referer || 'None');
  headerOrigin.textContent = headersReady ? 'Applied securely' : (origin || 'None');
  headerUserAgent.textContent = headersReady ? 'Applied securely' : (useragent || navigator.userAgent);

  // Detect format
  let format = 'mp4';
  const lowerUrl = streamUrl.toLowerCase();
  if (lowerUrl.includes('.m3u8') || lowerUrl.includes('hls') || lowerUrl.includes('mpegurl')) {
    format = 'hls';
  } else if (lowerUrl.includes('.mpd') || lowerUrl.includes('dash')) {
    format = 'dash';
  }
  
  specFormat.textContent = format === 'hls' ? 'HLS (.m3u8)' : format === 'dash' ? 'DASH (.mpd)' : 'Direct Video';
  
  // Resolution parsing
  let res = 'Unknown';
  if (lowerUrl.includes('1080')) res = '1080p';
  else if (lowerUrl.includes('720')) res = '720p';
  else if (lowerUrl.includes('480')) res = '480p';
  else if (lowerUrl.includes('360')) res = '360p';
  specResolution.textContent = res;

  // Dynamic header bypass trigger
  log('Triggering outbound header bypass configuration...');
  const bypassHeaders = {};
  if (referer) bypassHeaders.referer = referer;
  if (origin) bypassHeaders.origin = origin;
  if (useragent) bypassHeaders['user-agent'] = useragent;

  const bypassTargets = [{
    url: streamUrl,
    headers: bypassHeaders
  }];
  if (audioUrl) {
    const audioBypassHeaders = {};
    if (audioReferer) audioBypassHeaders.referer = audioReferer;
    if (audioOrigin) audioBypassHeaders.origin = audioOrigin;
    if (audioUseragent) audioBypassHeaders['user-agent'] = audioUseragent;
    bypassTargets.push({ url: audioUrl, headers: audioBypassHeaders });
  }

  function normalizedUrl(value) {
    try {
      return new URL(value, streamUrl).href;
    } catch (_) {
      return String(value || '');
    }
  }

  function selectHlsDubbingTrack(hls) {
    if (!audioUrl || !hls || !Array.isArray(hls.audioTracks)) return false;
    const wantedUrl = normalizedUrl(audioUrl);
    let index = hls.audioTracks.findIndex((track) => {
      const urls = Array.isArray(track.url) ? track.url : [track.url];
      return urls.some((url) => normalizedUrl(url) === wantedUrl);
    });
    if (index === -1 && audioLanguage !== 'unknown') {
      index = hls.audioTracks.findIndex((track) => String(track.lang || '').toLowerCase() === audioLanguage);
    }
    if (index === -1) {
      index = hls.audioTracks.findIndex((track) => String(track.name || '').toLowerCase() === audioLabel.toLowerCase());
    }
    if (index === -1) return false;
    hls.audioTrack = index;
    log(`Selected dubbing track: ${audioLabel} (${audioLanguage.toUpperCase()})`, 'success');
    return true;
  }

  // Handle spin state
  video.addEventListener('waiting', () => {
    spinner.style.opacity = '1';
  });
  video.addEventListener('loadedmetadata', () => {
    if (video.videoHeight) {
      const realRes = `${video.videoHeight}p`;
      specResolution.textContent = realRes;
      log(`Real resolution loaded from metadata: ${video.videoWidth}x${video.videoHeight} (${realRes})`, 'success');

      chrome.runtime.sendMessage({
        action: 'update_stream_quality',
        url: streamUrl,
        resolution: realRes
      });
    }
  });
  video.addEventListener('playing', () => {
    spinner.style.opacity = '0';
    specState.textContent = 'Playing';
    specState.className = 'font-bold text-emerald-400 mt-0.5 block';
  });
  video.addEventListener('error', () => {
    spinner.style.opacity = '0';
    log(`Playback Error: ${video.error ? video.error.message || 'code ' + video.error.code : 'unknown'}`, 'error');
    specState.textContent = 'Error';
    specState.className = 'font-bold text-rose-500 mt-0.5 block';
  });

  function initializePlayback() {
    if (format === 'hls') {
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        log('Initializing HLS.js engine...', 'info');
        engineBadge.textContent = 'HLS.js Engine';
        const hls = new Hls();
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
          selectHlsDubbingTrack(hls);
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (audioUrl) selectHlsDubbingTrack(hls);
          log('HLS Manifest successfully parsed. Starting playback...', 'success');
        });
        hls.on(Hls.Events.ERROR, function (event, data) {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                log(`HLS Network Error: ${data.details}. Retrying...`, 'warning');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                log(`HLS Media Error: ${data.details}. Recovering...`, 'warning');
                hls.recoverMediaError();
                break;
              default:
                log(`HLS Fatal Error: ${data.details}. Playback terminated.`, 'error');
                hls.destroy();
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        log('Initializing Native HLS playback...', 'info');
        engineBadge.textContent = 'Safari Native';
        video.src = streamUrl;
      } else {
        log('HLS is not supported in this browser.', 'error');
      }
    } else if (format === 'dash') {
      if (typeof dashjs !== 'undefined') {
        log('Initializing Dash.js engine...', 'info');
        engineBadge.textContent = 'Dash.js Engine';
        const player = dashjs.MediaPlayer().create();
        player.initialize(video, streamUrl, true);
        log('DASH media player initialized.', 'success');
      } else {
        log('Dash.js library is not loaded. Unable to play DASH stream.', 'error');
      }
    } else {
      log('Initializing HTML5 Direct MP4 playback...', 'info');
      engineBadge.textContent = 'HTML5 Native';
      video.src = streamUrl;
    }
  }

  if (headersReady) {
    log('Header bypass ready before player initialization.', 'success');
    initializePlayback();
  } else {
    chrome.runtime.sendMessage({ action: 'set_bypass_rules', targets: bypassTargets }, (response) => {
      if (chrome.runtime.lastError || !response || response.ok !== true) {
        log('Header bypass could not be confirmed; starting playback without it.', 'warning');
      } else {
        log(`Header bypass ready (${response.ruleCount} rule${response.ruleCount === 1 ? '' : 's'}).`, 'success');
      }
      initializePlayback();
    });
  }

  // Cleanup on tab closing
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ action: 'clear_bypass_rules' });
  });
});

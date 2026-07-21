document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const label = params.get('label') || 'Subtitle';

  const subtitleTitle = document.getElementById('subtitle-title');
  const subtitleUrl = document.getElementById('subtitle-url');
  const subtitleContent = document.getElementById('subtitle-content');
  const spinner = document.getElementById('loading-spinner');
  const btnCloseTab = document.getElementById('btn-close-tab');

  subtitleTitle.textContent = label;
  subtitleUrl.textContent = url || 'No URL Provided';

  if (btnCloseTab) {
    btnCloseTab.addEventListener('click', () => {
      window.close();
    });
  }

  if (!url) {
    spinner.style.opacity = '0';
    subtitleContent.textContent = 'No subtitle URL was provided to the reader.';
    subtitleContent.style.opacity = '1';
    subtitleContent.classList.add('text-rose-400');
    return;
  }

  const referer = params.get('referer');
  const origin = params.get('origin');
  const useragent = params.get('useragent');

  // Trigger dynamic header bypass configuration for the subtitle request
  const bypassHeaders = {};
  if (referer) bypassHeaders.referer = referer;
  if (origin) bypassHeaders.origin = origin;
  if (useragent) bypassHeaders['user-agent'] = useragent;

  if (referer || origin || useragent) {
    chrome.runtime.sendMessage({
      action: 'set_bypass_rules',
      targetUrl: url,
      headers: bypassHeaders
    });
  }

  // Cleanup dynamic DNR rules when the tab unloads
  window.addEventListener('beforeunload', () => {
    chrome.runtime.sendMessage({ action: 'clear_bypass_rules' });
  });

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Server responded with HTTP ${res.status}`);
    
    const text = await res.text();
    
    spinner.style.opacity = '0';
    
    if (!text || text.trim() === '') {
      subtitleContent.textContent = 'The subtitle file is empty.';
      subtitleContent.classList.add('text-amber-400');
    } else {
      subtitleContent.textContent = text;
    }
    
    subtitleContent.style.opacity = '1';
    
  } catch (e) {
    spinner.style.opacity = '0';
    subtitleContent.textContent = `Failed to download the subtitle text.\n\nError Details:\n${e.message}\n\nThe server might be blocking direct access (CORS) or the URL might have expired.`;
    subtitleContent.classList.add('text-rose-400');
    subtitleContent.style.opacity = '1';
  }
});

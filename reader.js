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

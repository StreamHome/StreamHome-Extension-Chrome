(function initializeStreamLearning(root) {
  const ROLES = Object.freeze(['favorite', 'video', 'audio']);
  const RECOMMENDATION_THRESHOLD = 10;
  const MEDIA_EXTENSIONS = new Set([
    'm3u8', 'mpd', 'mp4', 'mkv', 'webm', 'm4v', 'mov',
    'm4a', 'mp3', 'aac', 'ogg', 'wav', 'flac', 'ts'
  ]);
  const KNOWN_EXTENSIONS = new Set([
    ...MEDIA_EXTENSIONS,
    'txt', 'json', 'xml', 'php', 'asp', 'aspx'
  ]);

  function emptyPatterns() {
    return {
      version: 2,
      task_migration_complete: false,
      examples: {
        favorite: {},
        video: {},
        audio: {}
      },
      video_patterns: [],
      audio_patterns: [],
      favorite_patterns: []
    };
  }

  function normalizePatterns(value) {
    const source = value && typeof value === 'object' ? value : {};
    const normalized = emptyPatterns();
    normalized.version = Math.max(2, Number(source.version) || 0);
    normalized.task_migration_complete = source.task_migration_complete === true;

    for (const role of ROLES) {
      const legacyKey = `${role}_patterns`;
      normalized[legacyKey] = Array.isArray(source[legacyKey])
        ? [...new Set(source[legacyKey].filter(item => typeof item === 'string' && item))]
        : [];

      const sourceExamples = source.examples && source.examples[role];
      if (!sourceExamples || typeof sourceExamples !== 'object') continue;

      for (const [key, example] of Object.entries(sourceExamples)) {
        if (!example || !Array.isArray(example.features)) continue;
        const features = [...new Set(example.features.filter(item => typeof item === 'string' && item))];
        const count = Math.max(0, Math.floor(Number(example.count) || 0));
        if (!features.length || !count) continue;
        normalized.examples[role][key] = {
          features,
          count,
          lastSeen: Number(example.lastSeen) || 0
        };
      }
    }

    return normalized;
  }

  function safelyDecodeSegment(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function getExtension(segment) {
    const match = String(segment || '').toLowerCase().match(/\.([a-z0-9]{1,6})$/);
    return match && KNOWN_EXTENSIONS.has(match[1]) ? match[1] : '';
  }

  function looksHighEntropy(value) {
    const compact = value.replace(/[^a-z0-9]/gi, '');
    if (compact.length < 10) return false;

    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasDigit = /\d/.test(value);
    if (hasLower && hasUpper && hasDigit) return true;

    const uniqueRatio = new Set(compact.toLowerCase()).size / compact.length;
    return compact.length >= 16 && uniqueRatio > 0.72 && !/^[a-z]+$/i.test(compact);
  }

  function isStableSegment(segment) {
    if (!segment || segment.length > 48 || looksHighEntropy(segment)) return false;
    const lower = segment.toLowerCase();
    if (!/^[a-z0-9._-]+$/.test(lower)) return false;
    const digitCount = (lower.match(/\d/g) || []).length;
    if (digitCount / lower.length > 0.35) return false;
    const pieces = lower.split(/[-_.]+/).filter(Boolean);
    return pieces.length <= 4 && pieces.every(piece => piece.length <= 24);
  }

  function normalizePathSegment(rawSegment) {
    const decoded = safelyDecodeSegment(rawSegment).replace(/[\u0000-\u001f\u007f]/g, '');
    const lower = decoded.toLowerCase();
    if (isStableSegment(decoded)) return lower;

    const extension = getExtension(lower);
    return extension ? `*.${extension}` : '*';
  }

  function normalizeHostFamily(host) {
    return host
      .split('.')
      .map((label) => {
        if (/^[a-z]$/.test(label)) return '*';
        return label
          .replace(/\d+/g, '#')
          .replace(/-[a-z]$/, '-*');
      })
      .join('.');
  }

  function hashString(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function extractFeatures(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return null;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) return null;

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (!host) return null;

    const rawSegments = parsed.pathname.split('/').filter(Boolean);
    const normalizedSegments = rawSegments.map(normalizePathSegment);
    const features = new Set([
      `host:${host}`,
      `host-family:${normalizeHostFamily(host)}`,
      `depth:${Math.min(rawSegments.length, 6)}`
    ]);

    const finalRawSegment = rawSegments[rawSegments.length - 1] || '';
    const finalSegment = normalizedSegments[normalizedSegments.length - 1] || '';
    const finalExtension = getExtension(finalRawSegment);
    if (finalExtension) features.add(`ext:${finalExtension}`);
    if (finalSegment && finalSegment !== '*' && !finalSegment.startsWith('*.')) {
      features.add(`file:${finalSegment}`);
    }

    normalizedSegments.slice(0, -1).forEach((segment) => {
      if (segment !== '*' && !segment.startsWith('*.')) features.add(`dir:${segment}`);
    });

    rawSegments.slice(0, -1).forEach((segment) => {
      const extension = getExtension(segment);
      if (extension && MEDIA_EXTENSIONS.has(extension)) {
        features.add(`embedded-ext:${extension}`);
      }
    });

    for (const tailLength of [2, 3]) {
      if (normalizedSegments.length < tailLength) continue;
      const tail = normalizedSegments.slice(-tailLength);
      const stableCount = tail.filter(segment => segment !== '*' && !segment.startsWith('*.')).length;
      const wildcardCount = tail.filter(segment => segment === '*' || segment.startsWith('*.')).length;
      if (stableCount >= 2 && wildcardCount <= 1) {
        features.add(`tail${tailLength}:${tail.join('/')}`);
      }
    }

    const queryKeys = [...new Set([...parsed.searchParams.keys()]
      .map(key => key.toLowerCase())
      .filter(key => /^[a-z][a-z0-9_-]{0,23}$/.test(key)))]
      .slice(0, 6);
    queryKeys.forEach(key => features.add(`query-key:${key}`));

    const sortedFeatures = [...features].sort();
    const structuralFeatures = sortedFeatures.filter(feature => !feature.startsWith('host:'));
    return {
      features: sortedFeatures,
      key: `u_${hashString(structuralFeatures.join('|'))}`,
      legacyHost: host,
      legacyExtension: finalExtension && MEDIA_EXTENSIONS.has(finalExtension)
        ? `.${finalExtension}`
        : ''
    };
  }

  function updateExample(patterns, role, url, delta) {
    if (!ROLES.includes(role) || !delta) return patterns;
    const extracted = extractFeatures(url);
    if (!extracted) return patterns;

    const examples = patterns.examples[role];
    const existing = examples[extracted.key];
    const nextCount = Math.max(0, (existing ? existing.count : 0) + delta);
    if (!nextCount) {
      delete examples[extracted.key];
      return patterns;
    }

    examples[extracted.key] = {
      features: extracted.features,
      count: nextCount,
      lastSeen: Date.now()
    };
    return patterns;
  }

  function visitTaskFeedback(tasks, callback) {
    for (const task of Array.isArray(tasks) ? tasks : []) {
      const scopes = [task];
      if (task && task.episodes && typeof task.episodes === 'object') {
        scopes.push(...Object.values(task.episodes));
      }

      for (const scope of scopes) {
        if (!scope || typeof scope !== 'object') continue;
        for (const url of Array.isArray(scope.favorites) ? scope.favorites : []) {
          callback('favorite', url);
        }
        if (scope.taggedVideoUrl) callback('video', scope.taggedVideoUrl);
        if (scope.taggedAudioUrl) callback('audio', scope.taggedAudioUrl);
      }
    }
  }

  function migratePatterns(value, tasks) {
    const patterns = normalizePatterns(value);
    if (patterns.task_migration_complete) return patterns;

    visitTaskFeedback(tasks, (role, url) => {
      updateExample(patterns, role, url, 1);
    });
    patterns.task_migration_complete = true;
    return patterns;
  }

  function recordFeedback(value, role, url, delta) {
    const patterns = normalizePatterns(value);
    return updateExample(patterns, role, url, delta > 0 ? 1 : -1);
  }

  function featureWeight(feature) {
    if (feature.startsWith('tail3:')) return 8;
    if (feature.startsWith('tail2:')) return 7;
    if (feature.startsWith('file:')) return 5;
    if (feature.startsWith('host-family:')) return 4;
    if (feature.startsWith('host:')) return 3;
    if (feature.startsWith('embedded-ext:')) return 2;
    if (feature.startsWith('dir:')) return 1;
    if (feature.startsWith('ext:')) return 1;
    if (feature.startsWith('query-key:')) return 0.5;
    if (feature.startsWith('depth:')) return 0.25;
    return 0;
  }

  function scoreExample(candidate, example) {
    const candidateFeatures = new Set(candidate.features);
    const matchedFeatures = example.features.filter(feature => candidateFeatures.has(feature));
    const hasStrongMatch = matchedFeatures.some(feature => (
      feature.startsWith('file:')
      || feature.startsWith('tail2:')
      || feature.startsWith('tail3:')
    ));
    const baseScore = matchedFeatures.reduce((total, feature) => total + featureWeight(feature), 0);
    const recurrenceBonus = matchedFeatures.length
      ? Math.min(3, Math.log2(Math.max(1, example.count) + 1))
      : 0;
    const score = baseScore + recurrenceBonus;
    const recommended = score >= RECOMMENDATION_THRESHOLD
      && (hasStrongMatch || (example.count >= 2 && matchedFeatures.length >= 4));
    return { score, recommended, matchedFeatures };
  }

  function scoreLegacy(candidate, patterns, role) {
    const legacyPatterns = patterns[`${role}_patterns`] || [];
    for (const signature of legacyPatterns) {
      const separatorIndex = signature.lastIndexOf('|.');
      const host = (separatorIndex >= 0 ? signature.slice(0, separatorIndex) : signature).toLowerCase();
      const extension = separatorIndex >= 0 ? signature.slice(separatorIndex + 1).toLowerCase() : '';
      const exactHost = host === candidate.legacyHost;
      const exactExtension = !extension || extension === candidate.legacyExtension;

      if (exactHost && exactExtension && (role !== 'favorite' || Boolean(extension))) {
        return {
          score: RECOMMENDATION_THRESHOLD,
          recommended: true,
          matchedFeatures: ['legacy-signature']
        };
      }
    }
    return { score: 0, recommended: false, matchedFeatures: [] };
  }

  function getRecommendation(url, value, role) {
    const candidate = extractFeatures(url);
    const patterns = normalizePatterns(value);
    if (!candidate || !ROLES.includes(role)) {
      return { score: 0, recommended: false, matchedFeatures: [] };
    }

    let best = { score: 0, recommended: false, matchedFeatures: [] };
    for (const example of Object.values(patterns.examples[role])) {
      const result = scoreExample(candidate, example);
      if (result.score > best.score) best = result;
    }

    const legacy = scoreLegacy(candidate, patterns, role);
    return legacy.score > best.score ? legacy : best;
  }

  function selectBestRecommendation(candidates) {
    let best = null;
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      if (!candidate || !Number.isFinite(candidate.score)) continue;
      if (!best || candidate.score > best.score) best = candidate;
    }
    return best;
  }

  root.StreamLearning = Object.freeze({
    emptyPatterns,
    normalizePatterns,
    migratePatterns,
    recordFeedback,
    extractFeatures,
    getRecommendation,
    selectBestRecommendation,
    recommendationThreshold: RECOMMENDATION_THRESHOLD
  });
})(globalThis);

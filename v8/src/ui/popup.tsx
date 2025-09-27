import { classifyHost } from '../background/site-registry';
import { defaultConfig } from '../common/config';

type ConfigState = typeof defaultConfig;

const root = document.getElementById('root');

const UI_FONT = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function resolveHostType(url?: string | null) {
  if (!url) {
    return 'unknown';
  }
  try {
    const parsed = new URL(url);
    return classifyHost(parsed.hostname);
  } catch (error) {
    console.warn('Failed to parse URL', error);
    return 'unknown';
  }
}

function readConfig(): Promise<ConfigState> {
  return new Promise((resolve) => {
    chrome.storage?.local.get(['amnesiaConfig'], (result) => {
      const stored = result?.amnesiaConfig ?? {};
      resolve({ ...defaultConfig, ...stored });
    });
  });
}

function persistConfig(config: ConfigState) {
  chrome.storage?.local.set({ amnesiaConfig: config }, () => {
    if (chrome.runtime?.lastError) {
      console.warn('Failed to persist config', chrome.runtime.lastError);
    }
  });
}

function createToggle(label: string, checked: boolean, onToggle: (value: boolean) => void) {
  const wrapper = document.createElement('label');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'space-between';
  wrapper.style.gap = '16px';
  wrapper.style.padding = '10px 0';
  wrapper.style.borderBottom = '1px solid rgba(255,255,255,0.08)';

  const text = document.createElement('span');
  text.textContent = label;
  text.style.fontSize = '0.95rem';
  text.style.flex = '1';

  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = checked;
  toggle.style.width = '46px';
  toggle.style.height = '22px';

  toggle.addEventListener('change', () => {
    onToggle(toggle.checked);
  });

  wrapper.appendChild(text);
  wrapper.appendChild(toggle);

  return wrapper;
}

function renderStatus(container: HTMLElement, siteType: string) {
  const status = document.createElement('div');
  status.style.marginTop = '12px';
  status.style.padding = '12px';
  status.style.borderRadius = '10px';
  status.style.background = 'rgba(34, 211, 238, 0.12)';
  status.style.color = '#0f172a';
  status.style.fontSize = '0.9rem';
  status.style.fontWeight = '600';

  if (siteType === 'meeting') {
    status.textContent = 'Site Type: meeting · Protection: Meeting Shield Active (blur/voice)';
  } else if (siteType === 'llm') {
    status.textContent = 'Site Type: llm · Protection: Text Shield Active';
  } else {
    status.textContent = 'Site Type: unknown · Protection: Monitoring enabled';
  }

  container.appendChild(status);
}

async function init() {
  if (!root) {
    return;
  }

  root.innerHTML = '';
  root.style.fontFamily = UI_FONT;
  root.style.padding = '18px';
  root.style.minWidth = '280px';
  root.style.background = '#0f172a';
  root.style.color = '#f8fafc';

  const heading = document.createElement('h1');
  heading.textContent = 'Amnesia AI Shield';
  heading.style.fontSize = '1.35rem';
  heading.style.margin = '0 0 6px';

  const subheading = document.createElement('p');
  subheading.textContent = 'Local-first protection for prompts and meetings';
  subheading.style.margin = '0 0 18px';
  subheading.style.opacity = '0.75';
  subheading.style.fontSize = '0.85rem';

  root.appendChild(heading);
  root.appendChild(subheading);

  const controls = document.createElement('div');
  controls.style.background = 'rgba(15, 23, 42, 0.72)';
  controls.style.padding = '12px 16px';
  controls.style.borderRadius = '12px';
  controls.style.boxShadow = '0 10px 30px rgba(15, 23, 42, 0.35)';

  const config = await readConfig();

  controls.appendChild(
    createToggle('Text Shield (LLM prompts)', config.textShieldEnabled, (value) => {
      config.textShieldEnabled = value;
      persistConfig(config);
    })
  );

  controls.appendChild(
    createToggle('Meeting Shield (blur + voice)', config.meetingShieldEnabled, (value) => {
      config.meetingShieldEnabled = value;
      persistConfig(config);
    })
  );

  root.appendChild(controls);

  chrome.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
    const siteType = resolveHostType(tabs?.[0]?.url);
    renderStatus(root, siteType);
  });
}

init().catch((error) => console.error('Failed to initialise popup', error));

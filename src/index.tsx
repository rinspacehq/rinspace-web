import React from 'react';
import ReactDOM from 'react-dom/client';

import 'katex/dist/katex.min.css';

import App from './App';
import { removeStaticDocumentMetadata } from './components/DocumentMetadataController';
import { startPwaInstallPromptCapture } from './services/pwaInstallPrompt';
import { installManagedSessionRecovery } from './services/sessionRecovery';
import './styles/index.css';

startPwaInstallPromptCapture();
installManagedSessionRecovery();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

removeStaticDocumentMetadata();

async function waitForRinspaceFonts() {
  if (!document.fonts) return;
  await Promise.all([
    document.fonts.load('400 1rem "IBM Plex Sans"', 'Rinspace'),
    document.fonts.load('400 1rem "IBM Plex Mono"', 'Rinspace'),
    document.fonts.load('700 1.35rem "Rinspace Newsreader"', 'Rinspace'),
    document.fonts.load('400 1rem "Rinspace Noto Sans SC"', '芥子环'),
    document.fonts.load('700 1.35rem "Rinspace Noto Serif SC"', '芥子环'),
  ]);
  await document.fonts.ready;
}

const handleImgLoad = (evt: Event | UIEvent) => {
  const { target } = evt;

  if (target === null || !(target instanceof Element)) {
    return;
  }
  if (!/IMG/i.test(target.nodeName)) {
    return;
  }

  if (/error/i.test(evt.type)) {
    target.classList.add('broken');
    const attrSrc = target.getAttribute('src');
    const attrAlt = target.getAttribute('alt')?.trim();
    if (attrSrc && !attrAlt) {
      target.classList.add('invisible');
    }
  }

  if (/load/i.test(evt.type)) {
    target.classList.remove('broken', 'invisible');
  }
};

const handleClickLink = (evt: Event) => {
  const { target } = evt;

  if (target === null || !(target instanceof Element)) {
    return;
  }
  if (!/A/i.test(target.nodeName)) {
    return;
  }

  if (/\/(?:rinspace\/)?api\//.test(target.getAttribute('href') || '')) {
    evt.preventDefault();
    window.location.href = target.getAttribute('href') || '';
  }
};

document.addEventListener('error', handleImgLoad, true);
document.addEventListener('load', handleImgLoad, true);
document.addEventListener('click', handleClickLink, true);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

void waitForRinspaceFonts().then(() => {
  document.documentElement.classList.remove('rin-fonts-loading');
});

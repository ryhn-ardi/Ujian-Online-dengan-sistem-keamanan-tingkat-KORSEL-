import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Active Anti-Auto-Translate Runtime Guard for CBT Security
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('translate', 'no');
  document.documentElement.classList.add('notranslate');
  
  try {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target as HTMLElement;
          if (target && target.classList && (target.classList.contains('translated-ltr') || target.classList.contains('translated-rtl'))) {
            target.classList.remove('translated-ltr', 'translated-rtl');
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });
  } catch (e) {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

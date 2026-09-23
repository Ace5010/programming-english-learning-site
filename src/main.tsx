import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { startProgressSync } from './syncClient';
import './styles.css';
import './themeMotion.css';
import './themes.css';
import './themeLesson.css';
import './mobile.css';
import './sync.css';

void startProgressSync().then(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
));

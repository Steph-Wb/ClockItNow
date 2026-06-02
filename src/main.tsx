import { createRoot } from 'react-dom/client';
import './index.css';
import './i18n/config';   // i18n vor App initialisieren
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);

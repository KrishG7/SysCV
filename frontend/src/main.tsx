import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// StrictMode is intentionally removed: it double-invokes effects in dev mode,
// which causes the WebSocket to connect, disconnect, and reconnect during init.
createRoot(document.getElementById('root')!).render(<App />);

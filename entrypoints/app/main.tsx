import { createRoot } from 'react-dom/client';
import { App } from '../popup/App';
import '../popup/style.css';

createRoot(document.getElementById('root')!).render(<App surface="tab" />);

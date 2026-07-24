import { createRoot } from 'react-dom/client';
import { App } from '@/app/app';
import { ToastProvider } from '@/ui/toaster';
import '@/app/styles/global.css';

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
);

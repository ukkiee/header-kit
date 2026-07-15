import type { Preview } from '@storybook/react-vite';
import '../src/entrypoints/popup/style.css';

const preview: Preview = {
  parameters: {
    layout: 'padded',
  },
};

export default preview;

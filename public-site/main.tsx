import { hydrateRoot } from 'react-dom/client';
import Home from '../app/page';
import Demo from '../app/demo/page';
import '../app/globals.css';
const content = window.location.pathname === '/demo/' ? <Demo /> : <Home publicPreview />;
hydrateRoot(document.getElementById('root')!, content);

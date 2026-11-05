import { renderToString } from 'react-dom/server';
import { HomeContent } from '../components/home-content';
import Demo from '../app/demo/page';

export function render(planner = false) {
  // Always pre-render English; the browser switches locale after hydration.
  return renderToString(planner ? <Demo /> : <HomeContent publicPreview locale="en" />);
}

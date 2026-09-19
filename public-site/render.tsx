import { renderToString } from 'react-dom/server';
import Home from '../app/page';
import Demo from '../app/demo/page';
export function render(planner = false) {
  return renderToString(planner ? <Demo /> : <Home publicPreview />);
}

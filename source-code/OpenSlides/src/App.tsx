import { useEffect, useState } from 'react';
import { Home } from './home/Home';
import { EditorPage } from './editor/Editor';
import { SlideshowPage } from './present/Slideshow';
import { PresenterPage } from './present/Presenter';
import { startAutosave } from './store/storage';

export type Route =
  | { name: 'home' }
  | { name: 'editor'; id: string }
  | { name: 'present'; id: string; start: number }
  | { name: 'presenter'; id: string; start: number }
  | { name: 'audience'; id: string };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query);
  const start = Math.max(0, parseInt(q.get('s') ?? '0', 10) || 0);
  if (parts[0] === 'd' && parts[1]) return { name: 'editor', id: parts[1] };
  if (parts[0] === 'present' && parts[1]) return { name: 'present', id: parts[1], start };
  if (parts[0] === 'presenter' && parts[1]) return { name: 'presenter', id: parts[1], start };
  if (parts[0] === 'audience' && parts[1]) return { name: 'audience', id: parts[1] };
  return { name: 'home' };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => startAutosave(), []);

  switch (route.name) {
    case 'editor':
      return <EditorPage key={route.id} id={route.id} />;
    case 'present':
      return <SlideshowPage key={route.id} id={route.id} start={route.start} />;
    case 'audience':
      return <SlideshowPage key={route.id} id={route.id} start={0} audience />;
    case 'presenter':
      return <PresenterPage key={route.id} id={route.id} start={route.start} />;
    default:
      return <Home />;
  }
}

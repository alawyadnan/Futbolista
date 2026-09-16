export function observeConnectivity({ target = window, connection = navigator, onChange }) {
  let previous;
  const update = () => {
    const offline = connection.onLine === false;
    if (offline !== previous) { previous = offline; onChange(offline); }
  };
  target.addEventListener('online', update);
  target.addEventListener('offline', update);
  update();
  return () => {
    target.removeEventListener('online', update);
    target.removeEventListener('offline', update);
  };
}

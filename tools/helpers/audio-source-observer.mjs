// Test-only mapping: assert the original recording even when playback uses a Blob.
export function observeAudioSources() {
  const sources = new WeakMap(), urls = new Map();
  const originalFetch = window.fetch.bind(window), create = URL.createObjectURL.bind(URL);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args), read = response.blob.bind(response);
    response.blob = async () => {
      const blob = await read();
      sources.set(blob, response.url || String(args[0]));
      return blob;
    };
    return response;
  };
  URL.createObjectURL = blob => {
    const url = create(blob); urls.set(url, sources.get(blob)); return url;
  };
  window.__audioSource = url => urls.get(url) || url;
}

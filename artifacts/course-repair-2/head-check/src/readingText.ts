/** Shared by the UI and the static recording inventory. Never includes hidden answers. */
export function readingWords(text: string) {
  const phonetics = [...text.matchAll(/\/(?:[^/\n]*[\u0250-\u02ffˈˌːθð][^/\n]*|[aeioupbtdkgfvszmnlrhwj])\//g)].map(match => [match.index, match.index + match[0].length]);
  return [...text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g)]
    .filter(match => !phonetics.some(([start, end]) => match.index >= start && match.index < end))
    .map(match => ({ text: match[0], index: match.index }));
}

export function spokenEnglish(text: string) {
  return (text.match(/[A-Za-z][A-Za-z0-9'’.,:;!? /+_#=-]*/g) ?? []).map(part => part.trim()).join(' ').trim();
}

export function readingKey(text: string) {
  if (/^\/[^/]+\/$/.test(text.trim())) return '';
  return spokenEnglish(text).toLowerCase().replace(/’/g, "'").replace(/[.,:;!?]+$/, '').replace(/\s+/g, ' ').trim();
}

// URLs shared by legacy Bible pages and scripture previews in A Sentinela.
const bookSlugs = ["genesis", "exodo", "levitico", "numeros", "deuteronomio", "josue", "juizes", "rute", "1samuel", "2samuel", "1reis", "2reis", "1cronicas", "2cronicas", "esdras", "neemias", "ester", "jo", "salmos", "proverbios", "eclesiastes", "canticos", "isaias", "jeremias", "lamentacoes", "ezequiel", "daniel", "oseias", "joel", "amos", "obadias", "jonas", "miqueias", "naum", "habacuque", "sofonias", "ageu", "zacarias", "malaquias", "mateus", "marcos", "lucas", "joao", "atos", "romanos", "1corintios", "2corintios", "galatas", "efesios", "filipenses", "colossenses", "1tessalonicenses", "2tessalonicenses", "1timoteo", "2timoteo", "tito", "filemon", "hebreus", "tiago", "1pedro", "2pedro", "1joao", "2joao", "3joao", "judas", "apocalipse"];
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.\s_-]/g, '');
const aliases = {filemom:'filemon', filemon:'filemon', cantico:'canticos', canticodesalomao:'canticos', canticodoscanticos:'canticos', deut:'deuteronomio'};

export function bibleBookNumber(value, abbreviations = {}) {
  const raw = String(value || '').trim().replace(/^\d{1,2}-/, '');
  const key = normalize(raw);
  const abbreviation = Object.entries(abbreviations).find(([name]) => normalize(name) === key)?.[1];
  const slug = normalize(abbreviation || raw);
  return bookSlugs.indexOf(aliases[slug] || slug) + 1;
}

export function bibleChapterURL(book, chapter, verse, endVerse = null, endChapter = null) {
  const url = new URL('biblia.html', import.meta.url);
  const number = Number(book);
  if (Number.isInteger(number) && number >= 1 && number <= 66) url.searchParams.set('book', number);
  if (Number.isInteger(Number(chapter)) && Number(chapter) >= 1 && Number(chapter) <= 150) url.searchParams.set('chapter', Number(chapter));
  if (Number.isInteger(Number(verse)) && Number(verse) >= 1 && Number(verse) <= 176) url.searchParams.set('verse', Number(verse));
  const lastChapter = Number(endChapter) || Number(chapter), lastVerse = Number(endVerse);
  if (url.searchParams.has('verse') && Number.isInteger(lastChapter) && lastChapter >= Number(chapter) && lastChapter <= 150 &&
      Number.isInteger(lastVerse) && lastVerse >= 1 && lastVerse <= 176 && (lastChapter > Number(chapter) || lastVerse >= Number(verse))) {
    url.searchParams.set('endVerse', lastVerse);
    if (lastChapter !== Number(chapter)) url.searchParams.set('endChapter', lastChapter);
  }
  return url;
}

export function legacyChapterURL(search) {
  const params = new URLSearchParams(search);
  const book = bibleBookNumber(params.get('livro')) || Number(params.get('book'));
  return bibleChapterURL(book, params.get('cap') || params.get('chapter'), params.get('verso') || params.get('verse'), params.get('endVerse'), params.get('endChapter'));
}

export function bibleReferenceURL(reference, abbreviations = {}) {
  const first = String(reference || '').split(';')[0].trim().replace(/^[([]\s*/, '');
  const match = first.match(/^(.+?)\s*(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3}))?/);
  if (!match) return null;
  const book = bibleBookNumber(match[1], abbreviations);
  return book ? bibleChapterURL(book, Number(match[2]), Number(match[3]), match[5], match[4]) : null;
}

export function appendBibleChapterLink(container, reference, abbreviations = {}) {
  const url = bibleReferenceURL(reference, abbreviations);
  if (!url) return;
  container.querySelector('.bible-reader-link')?.remove();
  // Keep the link outside <p>: the editor transcribes only verse paragraphs.
  const link = document.createElement('a');
  link.className = 'bible-reader-link';
  link.href = url.href;
  link.textContent = 'Abrir capítulo';
  link.setAttribute('aria-label', `Abrir ${String(reference).split(';')[0].trim()} na Bíblia`);
  link.style.cssText = 'display:inline-flex;align-items:center;min-height:44px;margin-top:12px;padding:0 14px;border:1px solid currentColor;border-radius:6px;color:var(--primary-color,#5b3c88);text-decoration:none;font:600 15px/1.3 "Noto Sans",sans-serif;';
  container.append(link);
}

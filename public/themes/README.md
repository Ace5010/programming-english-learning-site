# Theme assets

These assets are served locally with the existing static site. No font service is contacted at runtime.

- `graffiti-accent.webp`: the generated spray paint texture approved in the local graffiti reference. It is used behind opaque reading surfaces.
- `fonts/patrick-hand.woff2` and `fonts/knewave.woff2`: Latin subsets from Google Fonts for English target words.
- `fonts/wenkai-headings.woff2`: LXGW WenKai TC from Google Fonts, subset for existing interface headings. This family also includes the simplified characters requested by this site.
- `fonts/kuaile-headings.woff2`: ZCOOL KuaiLe from Google Fonts, with the same interface character subset.

Chinese subsets contain the unique Chinese characters in `src/App.tsx`, `src/ReviewLesson.tsx`, `src/LessonExercise.tsx`, `src/ReviewSpelling.tsx`, and the vocabulary category names at the time of introduction. The exact subset is in `fonts/heading-characters.txt`. Missing future heading characters fall back to the system font. Definitions, examples, phonetic transcriptions and spelling inputs retain readable system fonts.

Each font has its SIL Open Font License beside it. `fonts/sources.json` records the original family, download query and license source. Downloaded font data was not edited after receiving the Google Fonts subset.

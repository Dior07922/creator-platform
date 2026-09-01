export type Chapter = { id: string; title: string; text: string };
export type Character = { id: string; name: string; role: string; personality: string; motivation: string; past: string; relationships: string; habits: string; abilities: string; appearance: string; notes: string };
export type Outline = { core: string; mainline: string; beginning: string; development: string; climax: string; ending: string; foreshadowing: string };
export type Novel = { id: string; title: string; chapters: Chapter[]; activeChapterId: string; characters: Character[]; outline: Outline; updatedAt: number };

export const NOVELS_KEY = "jiantu-novels-v2";
export const emptyOutline = (): Outline => ({ core: "", mainline: "", beginning: "", development: "", climax: "", ending: "", foreshadowing: "" });
export const newCharacter = (): Character => ({ id: crypto.randomUUID(), name: "未命名人物", role: "", personality: "", motivation: "", past: "", relationships: "", habits: "", abilities: "", appearance: "", notes: "" });
export const newNovel = (title = "未命名小说"): Novel => {
  const chapter = { id: crypto.randomUUID(), title: "第一章 · 未命名章节", text: "" };
  return { id: crypto.randomUUID(), title, chapters: [chapter], activeChapterId: chapter.id, characters: [], outline: emptyOutline(), updatedAt: Date.now() };
};

export function normalizeNovel(value: Partial<Novel> & { chapter?: string; text?: string }): Novel {
  if (Array.isArray(value?.chapters)) {
    return { ...value, id: value.id || crypto.randomUUID(), title: value.title || "未命名小说", activeChapterId: value.activeChapterId || value.chapters[0]?.id, updatedAt: value.updatedAt || Date.now(), characters: value.characters || [], outline: { ...emptyOutline(), ...(value.outline || {}) } } as Novel;
  }
  const chapter = { id: crypto.randomUUID(), title: value?.chapter || "第一章 · 未命名章节", text: value?.text || "" };
  return { id: value?.id || crypto.randomUUID(), title: value?.title || "未命名小说", chapters: [chapter], activeChapterId: chapter.id, characters: [], outline: emptyOutline(), updatedAt: value?.updatedAt || Date.now() };
}

export function loadNovels(): Novel[] {
  try {
    const current = JSON.parse(localStorage.getItem(NOVELS_KEY) || "[]");
    if (current.length) return current.map(normalizeNovel);
  } catch {}
  try {
    const legacy = JSON.parse(localStorage.getItem("jiantu-novels-v1") || "[]");
    if (legacy.length) {
      const migrated = legacy.map(normalizeNovel);
      saveNovels(migrated);
      return migrated;
    }
  } catch {}
  const legacyTitle = localStorage.getItem("writingDraftTitle") || "";
  const legacyText = localStorage.getItem("writingDraftText") || "";
  if (legacyTitle.trim() || legacyText.trim()) {
    const migrated = newNovel(legacyTitle.trim() || "未命名小说");
    migrated.chapters[0].text = legacyText;
    saveNovels([migrated]);
    return [migrated];
  }
  return [];
}

export function saveNovels(novels: Novel[]) { localStorage.setItem(NOVELS_KEY, JSON.stringify(novels)); }
export function totalWords(novel: Novel) { return novel.chapters.reduce((sum, chapter) => sum + chapter.text.replace(/\s/g, "").length, 0); }

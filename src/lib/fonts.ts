// name=src/lib/fonts.ts
export type FontItem = {
  id: string;
  name: string;
  family: string;
};

export const FONT_LIBRARY: FontItem[] = [
  { id: "noto-sans-sc",   name: "思源黑体",     family: '"Noto Sans SC", sans-serif' },
  { id: "noto-serif-sc",  name: "思源宋体",     family: '"Noto Serif SC", serif' },
  { id: "lxgw-wenkai",    name: "霞鹜文楷",     family: '"LXGW WenKai", serif' },
  { id: "inter",          name: "Inter",       family: '"Inter", sans-serif' },
  { id: "source-sans-3",  name: "Source Sans 3", family: '"Source Sans 3", sans-serif' },
  { id: "source-serif-4", name: "Source Serif 4", family: '"Source Serif 4", serif' },
    { id: "smiley-sans", name: "得意黑", family: '"Smiley Sans", sans-serif' },
];

export const DEFAULT_FONT_FAMILY = '"Noto Sans SC", sans-serif';
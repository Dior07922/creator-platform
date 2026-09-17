import { create } from 'zustand';

export type DadaNode = {
  id: string;
  text: string;
  x: number;
  y: number;
  hue: number;
  media?: any;
};
export type DadaLink = { a: string; b: string };

type S = {
  nodes: DadaNode[];
  links: DadaLink[];
  selected: string | null;
  connectFrom: string | null;
  spawnNode: (text: string, x: number, y: number) => DadaNode;
  linkNodes: (a: string, b: string) => void;
  select: (id: string | null) => void;
  setConnectFrom: (id: string | null) => void;
  deleteNode: (id: string) => void;
};

export const useDada = create<S>((set, get) => ({
  nodes: [],
  links: [],
  selected: null,
  connectFrom: null,
  spawnNode: (text, x, y) => {
    const hue = [...text].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    const n: DadaNode = {
      id: 'n' + Math.random().toString(36).slice(2),
      text, x, y, hue,
    };
    set(s => ({ nodes: [...s.nodes, n] }));
    return n;
  },
  linkNodes: (a, b) => {
    if (a === b) return;
    const { links } = get();
    if (links.some(l => (l.a === a && l.b === b) || (l.a === b && l.b === a))) return;
    set(s => ({ links: [...s.links, { a, b }] }));
  },
  select: (id) => set({ selected: id }),
  setConnectFrom: (id) => set({ connectFrom: id }),
  deleteNode: (id) => set(s => ({
    nodes: s.nodes.filter(n => n.id !== id),
    links: s.links.filter(l => l.a !== id && l.b !== id),
  })),
}));
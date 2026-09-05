const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
// Normalize to LF
const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const lines = normalized.split('\n');
console.log('Total lines:', lines.length);

// Find line number of a function/const declaration
function findLine(pattern) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(pattern)) return i;
  }
  return -1;
}

// Find closing brace by counting { } from a start line
function findEnd(startLine) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let foundOpen = false;
  
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      const prev = j > 0 ? line[j-1] : '';
      
      // Simple string tracking (doesn't handle all edge cases but good enough)
      if ((ch === '"' || ch === "'" || ch === '`') && prev !== '\\') {
        if (!inString) { inString = true; stringChar = ch; }
        else if (ch === stringChar) { inString = false; }
        continue;
      }
      if (inString) continue;
      
      if (ch === '{') { depth++; foundOpen = true; }
      if (ch === '}') { depth--; if (foundOpen && depth === 0) return i; }
    }
  }
  return startLine;
}

// Define what to remove: [searchPattern, label]
const removals = [
  // Product/order components
  ['function DesignBriefScreen(', 'DesignBriefScreen'],
  ['function ProductScreen(', 'ProductScreen'],
  ['function ResourceProductScreen(', 'ResourceProductScreen'],
  ['function CheckoutScreen(', 'CheckoutScreen'],
  ['function PayingScreen(', 'PayingScreen'],
  ['function SuccessScreen(', 'SuccessScreen'],
  ['function OrdersScreen(', 'OrdersScreen'],
  ['function OrderDetailScreen(', 'OrderDetailScreen'],
  // Admin components
  ['function AdminLogin(', 'AdminLogin'],
  ['function AdminDashboard(', 'AdminDashboard'],
  ['function AdminSidebar(', 'AdminSidebar'],
  ['function AdminProducts(', 'AdminProducts'],
  ['function AdminInventory(', 'AdminInventory'],
  ['function AdminOrders(', 'AdminOrders'],
  // Visual system
  ['type VisualHotspot', 'VisualHotspot type'],
  ['const VISUAL_PAGES', 'VISUAL_PAGES'],
  ['const VISUAL_HOTSPOTS', 'VISUAL_HOTSPOTS'],
  ['function HandbookVisualScreen(', 'HandbookVisualScreen'],
  // DESIGN_SERVICE_CONTENT
  ['const DESIGN_SERVICE_CONTENT', 'DESIGN_SERVICE_CONTENT'],
  // AdminLoginTitleImage (only used by admin)
  ['function AdminLoginTitleImage(', 'AdminLoginTitleImage'],
  // PeekingLineIllustration (only used by admin)
  ['function PeekingLineIllustration(', 'PeekingLineIllustration'],
];

// Find ranges
const ranges = [];
for (const [pattern, label] of removals) {
  const start = findLine(pattern);
  if (start === -1) { console.log('NOT FOUND:', label); continue; }
  const end = findEnd(start);
  ranges.push({ label, start, end });
  console.log(`${label}: L${start+1} - L${end+1} (${end-start+1} lines)`);
}

// Sort by start line descending (delete from bottom to top)
ranges.sort((a, b) => b.start - a.start);

// Merge overlapping ranges
const merged = [{ ...ranges[0] }];
for (let i = 1; i < ranges.length; i++) {
  const curr = ranges[i];
  const prev = merged[merged.length - 1];
  if (curr.end >= prev.start - 1) {
    prev.start = Math.min(prev.start, curr.start);
    prev.end = Math.max(prev.end, curr.end);
    prev.label = curr.label + ' + ' + prev.label;
  } else {
    merged.push({ ...curr });
  }
}

// Also remove admin image imports
const importLines = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('adminPeekingLine') || lines[i].includes('adminLoginTitleTangyuan')) {
    importLines.push(i);
  }
}

console.log('\n=== Deletion plan ===');
let totalRemoved = 0;
for (const r of merged) {
  // Include surrounding blank lines
  let s = r.start;
  while (s > 0 && lines[s-1].trim() === '') s--;
  let e = r.end;
  while (e < lines.length - 1 && lines[e+1].trim() === '') e++;
  const count = e - s + 1;
  totalRemoved += count;
  console.log(`L${s+1}-L${e+1}: ${count} lines [${r.label.substring(0, 80)}]`);
}
totalRemoved += importLines.length;
console.log(`Import lines to remove: ${importLines.length}`);
console.log('Total lines to remove:', totalRemoved);
console.log('Remaining lines:', lines.length - totalRemoved);

// Now actually perform the deletion
const toDeleteSet = new Set();
for (const r of merged) {
  let s = r.start;
  while (s > 0 && lines[s-1].trim() === '') s--;
  let e = r.end;
  while (e < lines.length - 1 && lines[e+1].trim() === '') e++;
  for (let i = s; i <= e; i++) toDeleteSet.add(i);
}
for (const i of importLines) toDeleteSet.add(i);

const result = lines.filter((_, i) => !toDeleteSet.has(i)).join('\r\n');
fs.writeFileSync('src/App.tsx', result, 'utf8');
console.log('\nDone! File written successfully.');
console.log('New line count:', result.split('\n').length);

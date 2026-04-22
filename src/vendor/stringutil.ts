export function uuid(): string {
  return "p_" + Math.random().toString(36).slice(2);
}


export function stringToHashCode(str: string) {
  let hash = 0;
  if (str.length === 0) {
    return hash;
  }
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char; // Equivalent to hash * 31 + char
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

export function keyToNum(key: string | number) {
  return (typeof key === 'string') ? stringToHashCode(key) : key; 
}


export function splitFirst(h: string, needle: string): [string, string] {
  const i = h.indexOf(needle);
  if (i === -1) return [h, ""];
  return [h.slice(0, i), h.slice(i + needle.length)];
}

export function splitLast(h: string, needle: string): [string, string] {
  const i = h.lastIndexOf(needle);
  if (i === -1) return [h, ""];
  return [h.slice(0, i), h.slice(i + needle.length)];
}

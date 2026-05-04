// Strips edition/anniversary/deluxe suffixes so songs from "MMLP" and
// "MMLP (Deluxe)" are attributed to the same canonical album name.
export function canonicalAlbumName(name: string): string {
  let n = name;
  n = n.replace(/\s*[\(\[][^\)\]]*deluxe[^\)\]]*[\)\]]/gi, "");
  n = n.replace(/\s+-?\s*deluxe(\s+(version|edition))?\s*$/gi, "");
  n = n.replace(/\s*[\(\[][^\)\]]*expanded[^\)\]]*[\)\]]/gi, "");
  n = n.replace(/\s+-?\s*expanded(\s+edition)?\s*$/gi, "");
  n = n.replace(/\s*[\(\[][^\)\]]*\d+(st|nd|rd|th)?\s+anniversary[^\)\]]*[\)\]]/gi, "");
  n = n.replace(/\s+-?\s*\d+(st|nd|rd|th)?\s+anniversary.*$/gi, "");
  n = n.replace(/\s*[\(\[][^\)\]]*bonus[^\)\]]*[\)\]]/gi, "");
  n = n.replace(/\s+-?\s*bonus(\s+(cd|disc))?\s*$/gi, "");
  n = n.replace(/\s*[\(\[]coup\s+de\s+gr[âa]ce[\)\]]/gi, "");
  // Collapse repeated whitespace
  n = n.replace(/\s+/g, " ").trim();
  return n;
}

// Greatest-hits / compilation detection: if true, deprioritize this album
// when assigning a song's "home" album.
export function isCompilationAlbum(
  record_type: string,
  title: string,
): boolean {
  if (record_type === "compile") return true;
  // MTBMB Side B is a real studio album, not a comp — keep it
  if (/\bside b\b/i.test(title)) return false;
  return /\b(greatest hits|curtain call|the hits|hits$|presents|stans|essentials|collection|legendary|vault)\b/i.test(
    title,
  );
}

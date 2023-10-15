/**
 * Returns the index of the nth occurrence of a substring in a string.
 * @param str The string to search.
 * @param substr The substring to search for.
 * @param n The occurrence to find.
 * @returns The index of the nth occurrence of `substr` in `str`, or -1 if not found.
 */
export function nthIndex(str: string, substr: string, n: number) {
  var L = str.length,
    i = -1;
  while (n-- && i++ < L) {
    i = str.indexOf(substr, i);
    if (i < 0) break;
  }
  return i;
}

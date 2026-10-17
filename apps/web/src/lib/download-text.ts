/**
 * Save `content` as a file through the browser's download. The object URL is
 * revoked once the download has had time to start; some browsers read it after
 * `click` returns.
 */
export function downloadTextFile(fileName: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

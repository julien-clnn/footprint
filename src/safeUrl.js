// URLs in results come from pages anyone writes: links open only http(s) addresses, and
// images load only from http(s) or embedded data images (pictures read from a PDF).
export const webUrl = (url) => (typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? url : undefined);
export const imageUrl = (url) =>
  webUrl(url) ?? (typeof url === "string" && /^demo\/[\w-]+\.svg(\?[\w=]*)?$/.test(url) ? url : undefined)
  ?? (typeof url === "string" && /^data:image\/(jpeg|png|gif|webp);/i.test(url) ? url : undefined);

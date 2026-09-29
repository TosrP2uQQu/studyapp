// reviews-ui.js — tiny date helper for deck views.
// A card counts as "due" when its nextReviewDate is today or past,
// or when it has never been reviewed.
export function isDueSoon(nextReviewDate) {
  if (!nextReviewDate) return true;
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const day = `${y}-${m}-${d}`;
  return String(nextReviewDate).slice(0, 10) <= day;
}

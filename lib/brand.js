function pick(name, fallback) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const brandName = pick("BRAND_NAME", "RG Business transport");
const brandTagline = pick("BRAND_TAGLINE", "Ship line");
const brandMark = pick("BRAND_MARK", "RG");
const brandSlug = pick("BRAND_SLUG", "RG-Brothers");
const vocPrefix = pick("VOC_PREFIX", "RGB");

function brandFile(suffix) {
  return `${brandSlug}-${suffix}`;
}

function vocPattern() {
  const escaped = vocPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}-(\\d+)$`, "i");
}

function vocSequenceFrom(value) {
  const match = String(value || "").trim().match(vocPattern());
  return match ? Number(match[1]) : 0;
}

function formatVocNo(n) {
  return `${vocPrefix}-${n}`;
}

module.exports = {
  brandName,
  brandTagline,
  brandTaglineUpper: brandTagline.toUpperCase(),
  brandMark,
  brandSlug,
  vocPrefix,
  brandFile,
  vocSequenceFrom,
  formatVocNo,
};

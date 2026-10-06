const fs = require("fs/promises");
const path = require("path");

// Local disk for now. Swap put/get/remove for AWS later; callers keep using storageKey.
const ROOT = path.join(__dirname, "..", "uploads");

function resolveKey(key) {
  const normalized = String(key || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || path.isAbsolute(normalized)) {
    const error = new Error("Invalid storage key.");
    error.statusCode = 400;
    throw error;
  }
  const full = path.resolve(ROOT, normalized);
  const root = path.resolve(ROOT);
  if (full !== root && !full.startsWith(root + path.sep)) {
    const error = new Error("Invalid storage key.");
    error.statusCode = 400;
    throw error;
  }
  return { key: normalized, full };
}

async function put(key, buffer) {
  const target = resolveKey(key);
  await fs.mkdir(path.dirname(target.full), { recursive: true });
  await fs.writeFile(target.full, buffer);
  return target.key;
}

async function get(key) {
  const target = resolveKey(key);
  return fs.readFile(target.full);
}

async function remove(key) {
  const target = resolveKey(key);
  try {
    await fs.unlink(target.full);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function removeMany(keys) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  await Promise.all(list.map((key) => remove(key)));
}

module.exports = {
  ROOT,
  put,
  get,
  remove,
  removeMany,
};

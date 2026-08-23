const { HeldUp } = require("../models");

function toDateKey(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const part = value.substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(part)) return part;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function daysBetween(start, end) {
  const a = toDateKey(start);
  const b = toDateKey(end);
  if (!a || !b) return 0;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const startUtc = Date.UTC(ay, am - 1, ad);
  const endUtc = Date.UTC(by, bm - 1, bd);
  return Math.round((endUtc - startUtc) / 86400000);
}

function extraHeldUpDays(loadingDate, demountDate) {
  return Math.max(0, daysBetween(loadingDate, demountDate) - 1);
}

function pickHeldUpRate(rates, loadingDate) {
  const list = (Array.isArray(rates) ? rates : [])
    .slice()
    .sort((a, b) => {
      const byDate = String(b.date || "").localeCompare(String(a.date || ""));
      if (byDate) return byDate;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  const key = toDateKey(loadingDate);
  if (key) {
    const match = list.find((item) => String(item.date || "") <= key);
    if (match) return Number(match.amount) || 0;
  }
  const active = list.find((item) => item.status);
  return Number(active?.amount) || 0;
}

function heldUpFromDates(loadingDate, demountDate, rate) {
  const extraDays = extraHeldUpDays(loadingDate, demountDate);
  const dailyRate = Number(rate) || 0;
  return {
    extraDays,
    rate: dailyRate,
    amount: roundMoney(extraDays * dailyRate),
  };
}

const CHARGE_KEYS = ["weight", "dayHire", "outHire", "other", "heldUp", "return"];

function toAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function containerPaid(container = {}) {
  return roundMoney(toAmount(container.advanced) + toAmount(container.balancePaid));
}

function containerChargeTotal(container = {}) {
  return roundMoney(
    CHARGE_KEYS.reduce((sum, key) => sum + toAmount(container[key]), 0)
  );
}

function shouldSkipHeldUp(container = {}) {
  if (container.status === "completed") return true;
  const paid = containerPaid(container);
  return paid > 0 && roundMoney(containerChargeTotal(container) - paid) <= 0;
}

function applyHeldUpToContainer(container, rates) {
  const source =
    container && typeof container === "object"
      ? container.toObject
        ? container.toObject()
        : { ...container }
      : {};
  if (shouldSkipHeldUp(source)) {
    return {
      ...source,
      heldUp: toAmount(source.heldUp),
      heldUpExtraDays: 0,
      heldUpRate: 0,
    };
  }
  const calc = heldUpFromDates(
    source.loadingDate,
    source.demoundDate,
    pickHeldUpRate(rates, source.loadingDate)
  );
  return {
    ...source,
    heldUp: calc.amount,
    heldUpExtraDays: calc.extraDays,
    heldUpRate: calc.rate,
  };
}

function applyHeldUpToContainers(containers, rates) {
  return (Array.isArray(containers) ? containers : []).map((container) =>
    applyHeldUpToContainer(container, rates)
  );
}

async function loadHeldUpRates() {
  return HeldUp.find({}).sort({ date: -1, createdAt: -1 }).lean();
}

module.exports = {
  extraHeldUpDays,
  pickHeldUpRate,
  heldUpFromDates,
  applyHeldUpToContainer,
  applyHeldUpToContainers,
  loadHeldUpRates,
};

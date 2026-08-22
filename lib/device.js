const { User } = require("../models");

function clientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "";
}

function parseDevice(userAgent) {
  const ua = String(userAgent || "").trim();
  if (!ua) return "Unknown device";

  let browser = "Browser";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  let os = "Unknown OS";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let type = "Desktop";
  if (/iPad|Tablet/i.test(ua)) type = "Tablet";
  else if (/Mobile|Android|iPhone/i.test(ua)) type = "Mobile";

  return `${browser} on ${os} · ${type}`;
}

function sortDevices(devices) {
  return [...(devices || [])].sort((a, b) => {
    const aTime = new Date(a.lastLoginAt || 0).getTime();
    const bTime = new Date(b.lastLoginAt || 0).getTime();
    return bTime - aTime;
  });
}

function deviceFromRequest(req) {
  const userAgent = req.get?.("user-agent") || req.headers?.["user-agent"] || "";
  return {
    userAgent: String(userAgent).slice(0, 400),
    device: parseDevice(userAgent),
    ip: clientIp(req),
  };
}

function toDeviceList(user) {
  const devices = Array.isArray(user?.loginDevices)
    ? user.loginDevices.map((item) => item.toObject?.() || item)
    : [];
  if (devices.length) return devices;
  if (user?.lastLoginDevice) {
    return [
      {
        device: user.lastLoginDevice,
        userAgent: user.lastLoginUserAgent || "",
        ip: user.lastLoginIp || "",
        lastLoginAt: user.lastLoginAt || null,
        lastSeen: user.lastSeen || null,
      },
    ];
  }
  return [];
}

function lastLoginFields(devices) {
  const latest = devices[0];
  if (!latest) {
    return {
      lastLoginAt: null,
      lastLoginIp: "",
      lastLoginDevice: "",
      lastLoginUserAgent: "",
      loginDevices: [],
    };
  }
  return {
    lastLoginAt: latest.lastLoginAt || null,
    lastLoginIp: latest.ip || "",
    lastLoginDevice: latest.device || "",
    lastLoginUserAgent: latest.userAgent || "",
    loginDevices: devices,
  };
}

async function upsertLoginDevice(userId, req) {
  const { device, userAgent, ip } = deviceFromRequest(req);
  const now = new Date();
  const user = await User.findById(userId).select(
    "loginDevices lastLoginDevice lastLoginIp lastLoginAt lastLoginUserAgent lastSeen"
  );
  if (!user) return null;

  let devices = toDeviceList(user);
  const entry = {
    device,
    userAgent,
    ip,
    lastLoginAt: now,
    lastSeen: now,
  };
  const index = devices.findIndex((item) => item.device === device);
  if (index >= 0) devices[index] = { ...devices[index], ...entry };
  else devices.push(entry);

  devices = sortDevices(devices);
  await User.updateOne(
    { _id: userId },
    { lastSeen: now, ...lastLoginFields(devices) }
  );
  return devices;
}

async function removeLoginDevice(userId, req) {
  const { device } = deviceFromRequest(req);
  const user = await User.findById(userId).select(
    "loginDevices lastLoginDevice lastLoginIp lastLoginAt lastLoginUserAgent lastSeen"
  );
  if (!user) return [];

  const devices = sortDevices(
    toDeviceList(user).filter((item) => item.device !== device)
  );
  await User.updateOne({ _id: userId }, lastLoginFields(devices));
  return devices;
}

module.exports = {
  clientIp,
  parseDevice,
  sortDevices,
  upsertLoginDevice,
  removeLoginDevice,
};

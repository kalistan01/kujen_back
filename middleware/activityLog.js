const jwt = require("jsonwebtoken");
const { User, ActivityLog } = require("../models");

const SKIP_PREFIXES = ["/logs"];

function shouldLog(req) {
  const method = req.method;
  const url = String(req.originalUrl || "");
  if (SKIP_PREFIXES.some((prefix) => url.includes(prefix))) return false;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) return true;
  if (method === "GET" && url.includes("/export/")) return true;
  return false;
}

function sanitize(value) {
  if (!value || typeof value !== "object") return value || null;
  try {
    const clone = JSON.parse(JSON.stringify(value));
    const hide = ["password", "token", "cookie"];
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      Object.keys(obj).forEach((key) => {
        if (hide.includes(key.toLowerCase())) obj[key] = "***";
        else walk(obj[key]);
      });
    };
    walk(clone);
    const text = JSON.stringify(clone);
    if (text.length > 4000) {
      return { truncated: true, preview: text.slice(0, 4000) };
    }
    return clone;
  } catch {
    return null;
  }
}

function describeAction(req) {
  const method = req.method;
  const url = decodeURIComponent(
    String(req.originalUrl || req.path || "").split("?")[0]
  );

  if (url.includes("/user-login")) return { module: "auth", action: "Logged in" };
  if (url.includes("/logout")) return { module: "auth", action: "Logged out" };
  if (url.includes("/user-register"))
    return { module: "auth", action: "Registered admin" };
  if (url.includes("/user-reset"))
    return { module: "auth", action: "Reset password" };

  if (url.includes("/assignlorry") && url.includes("/export/pdf"))
    return { module: "assignment", action: "Exported PDF" };
  if (url.includes("/assignlorry") && url.includes("/export/excel"))
    return { module: "assignment", action: "Exported Excel" };
  if (url.includes("/assignlorry") && url.includes("/containers")) {
    if (method === "POST")
      return { module: "assignment", action: "Added container" };
    if (method === "PUT")
      return { module: "assignment", action: "Updated container" };
    if (method === "PATCH")
      return { module: "assignment", action: "Updated container status" };
    if (method === "DELETE")
      return { module: "assignment", action: "Removed container" };
  }
  if (url.includes("/assignlorry")) {
    if (method === "POST")
      return { module: "assignment", action: "Created assignment" };
    if (method === "PATCH")
      return { module: "assignment", action: "Updated assignment" };
    if (method === "DELETE")
      return { module: "assignment", action: "Deleted assignment" };
  }

  if (url.includes("/lorries")) {
    if (method === "POST") return { module: "lorry", action: "Added lorry" };
    if (method === "PUT") return { module: "lorry", action: "Updated lorry" };
    if (method === "DELETE") return { module: "lorry", action: "Removed lorry" };
  }
  if (url.includes("/lorry")) {
    if (method === "POST")
      return { module: "lorry", action: "Created lorry owner" };
    if (method === "PUT")
      return { module: "lorry", action: "Updated lorry owner" };
    if (method === "DELETE")
      return { module: "lorry", action: "Deleted lorry owner" };
  }

  if (url.includes("/destination")) {
    if (method === "POST")
      return { module: "destination", action: "Created destination" };
    if (method === "PUT")
      return { module: "destination", action: "Updated destination" };
    if (method === "DELETE")
      return { module: "destination", action: "Changed destination status" };
  }

  if (url.includes("/addRole") || (url.includes("/role") && method === "POST"))
    return { module: "role", action: "Created role" };
  if (url.includes("/updateRole"))
    return { module: "role", action: "Updated role" };
  if (url.includes("/deactivateRole"))
    return { module: "role", action: "Deactivated role" };
  if (url.includes("/activateRole"))
    return { module: "role", action: "Activated role" };

  if (url.includes("/user/") || url.endsWith("/user") || url.includes("/user?")) {
    if (method === "POST") return { module: "user", action: "Created user" };
    if (method === "PUT") return { module: "user", action: "Updated user" };
    if (method === "DELETE")
      return { module: "user", action: "Changed user status" };
  }

  return {
    module: url.split("/").filter(Boolean)[2] || "system",
    action: `${method} ${url}`,
  };
}

function buildSummary(req, described) {
  const body = req.body || {};
  if (body.blNo) return `${described.action} · BL ${body.blNo}`;
  if (body.fullName) return `${described.action} · ${body.fullName}`;
  if (body.email) return `${described.action} · ${body.email}`;
  if (body.roleName) return `${described.action} · ${body.roleName}`;
  if (body.ownerName || body.companyName)
    return `${described.action} · ${body.companyName || body.ownerName}`;
  if (body.location) return `${described.action} · ${body.location}`;
  if (body.containerNo) return `${described.action} · ${body.containerNo}`;
  return described.action;
}

function actorIdFromRequest(req) {
  if (req.tokenData?.userid) return req.tokenData.userid;
  const token = req.cookies?.token;
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_KEY);
    return decoded.userid;
  } catch {
    return null;
  }
}

exports.activityLog = (req, res, next) => {
  res.on("finish", async () => {
    try {
      if (!shouldLog(req)) return;
      const described = describeAction(req);
      const actorId = actorIdFromRequest(req);
      let actorName = req.body?.email || "Unknown";
      let actorEmail = req.body?.email || "";
      let actorRole = "";

      if (actorId) {
        const user = await User.findById(actorId).populate(
          "roleId",
          "roleName admin"
        );
        if (user) {
          actorName = user.fullName;
          actorEmail = user.email;
          actorRole = user.roleId?.roleName || "";
        }
      }

      await ActivityLog.create({
        action: described.action,
        module: described.module,
        method: req.method,
        path: String(req.originalUrl || req.path || "").split("?")[0],
        statusCode: res.statusCode,
        success: res.statusCode < 400,
        actorId: actorId || undefined,
        actorName,
        actorEmail,
        actorRole,
        summary: buildSummary(req, described),
        payload: sanitize(req.body),
        ip: req.ip || req.headers["x-forwarded-for"] || "",
        userAgent: req.get("user-agent") || "",
      });
    } catch (error) {
      console.error("Activity log failed:", error.message);
    }
  });
  next();
};

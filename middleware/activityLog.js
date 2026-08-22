const jwt = require("jsonwebtoken");
const { User, ActivityLog, Destination } = require("../models");
const { emitChange } = require("../lib/socket");
const {
  assignmentIdFromRequest,
  shouldLoadAssignment,
  loadPreviousAssignment,
  assignmentChangeSummary,
} = require("./assignmentLogDetails");
const {
  loadPreviousEntities,
  entityIdFromRequest,
  userChangeSummary,
  roleChangeSummary,
  lorryChangeSummary,
  heldUpChangeSummary,
  authChangeSummary,
} = require("./entityLogDetails");

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
  if (url.includes("/assignlorry") && url.includes("/pay-balances"))
    return { module: "assignment", action: "Paid selected balances" };
  if (url.includes("/assignlorry") && url.includes("/balance"))
    return { module: "assignment", action: "Paid container balance" };
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
    if (method === "DELETE") {
      const nextStatus = req.headers?.status;
      const activating =
        String(nextStatus) === "1" || nextStatus === 1 || nextStatus === true;
      return {
        module: "destination",
        action: activating ? "Activated destination" : "Deactivated destination",
      };
    }
  }

  if (url.includes("/heldup")) {
    if (method === "POST")
      return { module: "heldup", action: "Created held up rate" };
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
  if (body.type || body.location)
    return `${described.action} · ${[body.type, body.location]
      .filter(Boolean)
      .join(" · ")}`;
  if (body.amount !== undefined && body.date)
    return `${described.action} · Rs ${body.amount} · ${body.date}`;
  if (body.containerNo) return `${described.action} · ${body.containerNo}`;
  if (Array.isArray(body.containerIds) && body.containerIds.length) {
    return `${described.action} · ${body.containerIds.length} container${
      body.containerIds.length === 1 ? "" : "s"
    }`;
  }
  return described.action;
}

function destinationIdFromRequest(req) {  const url = String(req.originalUrl || req.path || "").split("?")[0];
  const match = url.match(/\/destination\/([a-fA-F0-9]{24})/);
  return match?.[1] || null;
}

function destinationLabel(type, location) {
  return [type, location].filter(Boolean).join(" · ");
}

function destinationChangeSummary(req, described) {
  const body = req.body || {};
  const previous = req._previousDestination || {};
  const type = body.type || previous.type;
  const location = body.location || previous.location;
  const label = destinationLabel(type, location);

  if (req.method === "POST") {
    return {
      action: "Created destination",
      summary: label || described.action,
    };
  }

  if (req.method === "PUT") {
    const changes = [];
    if (body.type && previous.type && body.type !== previous.type) {
      changes.push(`Changed type from ${previous.type} to ${body.type}`);
    }
    if (
      body.location &&
      previous.location &&
      body.location !== previous.location
    ) {
      changes.push(
        `Changed location from ${previous.location} to ${body.location}`
      );
    }
    return {
      action: location
        ? `Updated destination · ${location}`
        : "Updated destination",
      summary: changes.length ? changes.join(". ") : label || described.action,
    };
  }

  if (req.method === "DELETE") {
    return {
      action: described.action,
      summary: label || described.action,
    };
  }

  return { action: described.action, summary: described.action };
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
  const startLogging = () => {
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

        let action = described.action;
        let summary = buildSummary(req, described);
        let extraPayload;
        const success = res.statusCode < 400;

        if (described.module === "destination") {
          const destinationLog = destinationChangeSummary(req, described);
          action = destinationLog.action;
          summary = destinationLog.summary;
          extraPayload = { previous: req._previousDestination || undefined };
        } else if (described.module === "assignment") {
          const assignmentLog = await assignmentChangeSummary(req, described);
          action = assignmentLog.action;
          summary = assignmentLog.summary;
        } else if (described.module === "user") {
          const userLog = await userChangeSummary(req, described);
          action = userLog.action;
          summary = userLog.summary;
          extraPayload = { previous: req._previousUser || undefined };
        } else if (described.module === "role") {
          const roleLog = roleChangeSummary(req, described);
          action = roleLog.action;
          summary = roleLog.summary;
          extraPayload = { previous: req._previousRole || undefined };
        } else if (described.module === "lorry") {
          const lorryLog = lorryChangeSummary(req, described);
          action = lorryLog.action;
          summary = lorryLog.summary;
          extraPayload = { previous: req._previousOwner || undefined };
        } else if (described.module === "heldup") {
          const heldUpLog = heldUpChangeSummary(req, described);
          action = heldUpLog.action;
          summary = heldUpLog.summary;
        } else if (described.module === "auth") {
          const authLog = authChangeSummary(req, described, success);
          action = authLog.action;
          summary = authLog.summary;
          if (success && action === "Logged in") {
            const loginEmail = String(req.body?.email || "").trim().toLowerCase();
            const user =
              (actorId &&
                (await User.findById(actorId).populate("roleId", "roleName"))) ||
              (loginEmail &&
                (await User.findOne({ email: loginEmail }).populate(
                  "roleId",
                  "roleName"
                )));
            if (user) {
              actorName = user.fullName;
              actorEmail = user.email;
              actorRole = user.roleId?.roleName || "";
              summary = `Signed in as ${user.fullName}${
                actorRole ? ` · ${actorRole}` : ""
              }`;
            }
          }
        }

        const log = await ActivityLog.create({
          action,
          module: described.module,
          method: req.method,
          path: String(req.originalUrl || req.path || "").split("?")[0],
          statusCode: res.statusCode,
          success: res.statusCode < 400,
          actorId: actorId || undefined,
          actorName,
          actorEmail,
          actorRole,
          entityId:
            assignmentIdFromRequest(req) ||
            entityIdFromRequest(req) ||
            undefined,
          summary,
          payload: sanitize({
            ...(req.body || {}),
            ...(extraPayload || {}),
          }),
          ip: req.ip || req.headers["x-forwarded-for"] || "",
          userAgent: req.get("user-agent") || "",
        });
        emitChange(req, {
          module: "log",
          action: "created",
          id: log._id,
          actorId,
          actorName,
          data: log,
        });
      } catch (error) {
        console.error("Activity log failed:", error.message);
      }
    });
    next();
  };

  Promise.resolve()
    .then(async () => {
      const destinationId = destinationIdFromRequest(req);
      if (
        destinationId &&
        (req.method === "PUT" || req.method === "DELETE")
      ) {
        req._previousDestination = await Destination.findById(destinationId)
          .select("type location status")
          .lean();
      }
      if (shouldLoadAssignment(req)) {
        await loadPreviousAssignment(req);
      }
      await loadPreviousEntities(req);
    })
    .catch(() => {})
    .then(startLogging);
};

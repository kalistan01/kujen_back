const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { redactAssignment, redactLorryOwner } = require("../middleware/rbac");
const { accessDeniedMessage } = require("../middleware/requireAdmin");

function parseCookies(header) {
  return Object.fromEntries(
    String(header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        const key = part.slice(0, index);
        const value = part.slice(index + 1);
        try {
          return [key, decodeURIComponent(value)];
        } catch {
          return [key, value];
        }
      })
  );
}

function toPlain(value) {
  if (value == null) return null;
  if (typeof value.toObject === "function") return value.toObject();
  return value;
}

function getIo(req) {
  return req?.app?.get("io") || null;
}

function actorFromReq(req, payload = {}) {
  return {
    actorId: String(req?.tokenData?.userid || payload.actorId || ""),
    actorName: payload.actorName || "",
  };
}

function emitChange(req, payload) {
  const io = getIo(req);
  if (!io || !payload?.module) return;
  const actor = actorFromReq(req, payload);
  io.emit("data:changed", {
    module: payload.module,
    action: payload.action,
    id: payload.id != null ? String(payload.id) : "",
    actorId: actor.actorId,
    actorName: actor.actorName,
    data: payload.data ?? null,
  });
}

function isSocketActive(socket) {
  return Boolean(socket?.data?.userId && socket.data.active);
}

function handshakeActive(socket) {
  const value = socket?.handshake?.query?.active;
  const reported = Array.isArray(value) ? value[0] : value;
  return reported === "1" || reported === "true";
}

function onlineUserIds(io) {
  const ids = new Set();
  if (!io) return ids;
  for (const socket of io.sockets.sockets.values()) {
    if (isSocketActive(socket)) ids.add(String(socket.data.userId));
  }
  return ids;
}

function isUserOnline(io, userId) {
  const id = String(userId || "");
  if (!io || !id) return false;
  for (const socket of io.sockets.sockets.values()) {
    if (isSocketActive(socket) && String(socket.data.userId) === id) return true;
  }
  return false;
}

function emitPresence(io, userId, online, lastSeen) {
  if (!io || !userId) return;
  const data = {
    _id: String(userId),
    id: String(userId),
    online: Boolean(online),
  };
  if (lastSeen != null) data.lastSeen = lastSeen;
  io.emit("data:changed", {
    module: "user",
    action: "updated",
    id: String(userId),
    actorId: "",
    actorName: "",
    data,
  });
}

async function touchLastSeen(userId, online, io) {
  if (!userId) return;
  const lastSeen = new Date();
  await User.findByIdAndUpdate(userId, { lastSeen });
  emitPresence(io, userId, online, lastSeen);
}

function setSocketActive(socket, io, active) {
  const userId = socket?.data?.userId;
  if (!userId) return;
  const nextActive = Boolean(active);
  if (Boolean(socket.data.active) === nextActive) return;
  socket.data.active = nextActive;
  const online = isUserOnline(io, userId);
  if (nextActive || !online) {
    touchLastSeen(userId, online, io).catch(() => {});
  }
}

function emitLorryChange(req, payload) {
  const io = getIo(req);
  if (!io) return;
  const actor = actorFromReq(req, payload);
  const id = String(payload.id || payload.data?._id || "");
  const plain = toPlain(payload.data);

  for (const socket of io.sockets.sockets.values()) {
    const data = plain ? redactLorryOwner(plain, socket.data.role) : null;
    if (plain && !data && payload.action !== "deleted") continue;
    socket.emit("data:changed", {
      module: "lorry",
      action: payload.action,
      id,
      actorId: actor.actorId,
      actorName: actor.actorName,
      data,
    });
  }
}

function emitAssignmentChange(req, payload, assignment) {
  const io = getIo(req);
  if (!io) return;
  const actor = actorFromReq(req, payload);
  const id = String(payload.id || assignment?._id || "");
  const plain = toPlain(assignment);

  for (const socket of io.sockets.sockets.values()) {
    socket.emit("data:changed", {
      module: "assignment",
      action: payload.action,
      id,
      actorId: actor.actorId,
      actorName: actor.actorName,
      data: plain ? redactAssignment(plain, socket.data.role) : null,
    });
  }
}

function attachSocket(httpServer, corsOptions) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOptions.origin,
      methods: corsOptions.methods,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const cookies = parseCookies(socket.handshake.headers.cookie);
      const token = cookies.token;
      if (!token) return next(new Error("Unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_KEY);
      const user = await User.findById(decoded.userid).populate(
        "roleId",
        "roleName admin permission denied status allowedLorryOwners restrictLorryOwners"
      );
      if (!user) return next(new Error("Unauthorized"));
      const blocked = accessDeniedMessage(user);
      if (blocked) return next(new Error(blocked));

      socket.data.userId = String(user._id);
      socket.data.name = user.fullName;
      socket.data.role = user.roleId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    socket.data.active = handshakeActive(socket);
    if (socket.data.active) {
      touchLastSeen(userId, true, io).catch(() => {});
    }

    socket.on("presence:active", () => {
      setSocketActive(socket, io, true);
    });

    socket.on("presence:idle", () => {
      setSocketActive(socket, io, false);
    });

    socket.on("disconnect", () => {
      const wasActive = Boolean(socket.data.active);
      socket.data.active = false;
      const stillOnline = isUserOnline(io, userId);
      if (wasActive) {
        touchLastSeen(userId, stillOnline, io).catch(() => {});
      }
    });
  });

  return io;
}

module.exports = {
  attachSocket,
  emitChange,
  emitLorryChange,
  emitAssignmentChange,
  onlineUserIds,
};

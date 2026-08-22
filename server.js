require("dotenv").config();
const connectDatabase = require("./config/mongodb");
const http = require("http");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { User } = require("./models");
const { publicUser, accessDeniedMessage } = require("./middleware/requireAdmin");
const { activityLog } = require("./middleware/activityLog");
const { authCookie } = require("./config/cookie");
const { attachSocket } = require("./lib/socket");

const bodyParser = require('body-parser');
const cookieParser = require("cookie-parser");
const app = express();
app.use(cookieParser());
app.set("trust proxy", 1);
const corsOrigins = String(process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOptions = {
  origin: corsOrigins.length ? corsOrigins : true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  credentials: true,
};
// 
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));

app.use(express.json({ limit: "200mb" }));
app.use(
  express.urlencoded({
    limit: "200mb",
    extended: true,
    parameterLimit: 1000000,
  })
);
app.use((req, res, next) => {
  if (String(req.originalUrl || "").includes("/export/")) {
    return next();
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.get("/", (req, res) => {
  res.status(200).send("API is running.");
});
const routes = require("./routes");
app.use("/api/v1", activityLog);
app.get("/api/v1/auth/check", async (req, res) => {
  const token = req.cookies.token;

  if (!token) return res.status(401).json({ message: "Unauthorized" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_KEY);
    const user = await User.findById(decoded.userid).populate(
      "roleId",
      "roleName admin permission denied status"
    );
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const blocked = accessDeniedMessage(user);
    if (blocked) {
      res.clearCookie("token", {
        httpOnly: authCookie.httpOnly,
        secure: authCookie.secure,
        sameSite: authCookie.sameSite,
        path: authCookie.path,
      });
      return res.status(403).json({ message: blocked });
    }

    res.status(200).json({
      message: "Authenticated",
      user: publicUser(user),
    });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});
app.post("/api/v1/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: authCookie.httpOnly,
    secure: authCookie.secure,
    sameSite: authCookie.sameSite,
    path: authCookie.path,
  });
  res.status(200).json({ message: "Logged out" });
});

app.use("/api/v1", routes);
app.use((req, res, next) => {
  console.log(req.method, req.originalUrl);
  
  const error = new Error("Route not found");
  error.status = 404;
  next(error);
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  console.error(`Error: ${message}, Status: ${status}`);
  res.status(status).json({
    success: false,
    error: {
      message,
    },
  });
});
connectDatabase();
const PORT = process.env.PORT || 5001;
const HOST = process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";
const httpServer = http.createServer(app);
app.set("io", attachSocket(httpServer, corsOptions));
httpServer.listen(PORT, HOST, () =>
  console.log(`Server start on ${HOST}:${PORT}`)
);

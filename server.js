require("dotenv").config();
const connectDatabase = require("./config/mongodb");
const express = require("express");
const cors = require("cors");
const bodyParser = require('body-parser');
const app = express();
const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  credentials: true,
};
// 
app.use(cors(corsOptions));
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
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});
app.get("/", (req, res) => {
  res.status(200).send("API is running.");
});
const routes = require("./routes");
//api endpoints
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
app.listen(PORT, () => console.log(`Server start on port:${PORT}`));

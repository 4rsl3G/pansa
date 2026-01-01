const express = require("express");
const path = require("path");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const layouts = require("express-ejs-layouts");
require("dotenv").config();

const webRoutes = require("./src/routes/web");

const app = express();

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// express-ejs-layouts
app.use(layouts);
app.set("layout", "layouts/main");

// Middleware
app.use(morgan(process.env.NODE_ENV === "production" ? "tiny" : "dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Static
app.use("/public", express.static(path.join(__dirname, "public")));

// Routes
app.use("/", webRoutes);

// 404
app.use((req, res) => res.status(404).send("Not Found"));

// Listen (VPS)
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ PanStream running http://localhost:${port}`));

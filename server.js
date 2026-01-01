const express = require("express");
const path = require("path");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
require("dotenv").config();

const webRoutes = require("./src/routes/web");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use("/public", express.static(path.join(__dirname, "public")));

app.use("/", webRoutes);

app.use((req, res) => res.status(404).send("Not Found"));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`✅ PanStream running http://localhost:${port}`));

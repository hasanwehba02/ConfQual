require("dotenv").config();

const express = require("express");
const client = require("./config/database");

const analyticsRoutes = require("./routes/analyticsRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

const path = require("path");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/analytics", analyticsRoutes);

app.listen(PORT, () => {
    console.log(`Backend listening at http://localhost:${PORT}`);
});
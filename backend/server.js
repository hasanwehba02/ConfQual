require("dotenv").config();

const express = require("express");
const client = require("./config/database");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("ConfQual backend is running!");
});

app.listen(PORT, () => {
    console.log(`Backend listening at http://localhost:${PORT}`);
});
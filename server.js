import express from "express";
import axios from "axios";
import connectDB from "./utils/db.js";
import dotenv from "dotenv";
dotenv.config();

const PORT = 3000;
const app = express();
const apiBaseUrl = process.env.API_BASE_URL || "https://t4e-testserver.onrender.com/api";

app.use(express.json());

let dataset = [];

const startServer = async () => {
  try {
    const response = await axios.post(`${apiBaseUrl}/public/token`, {
        studentId: process.env.STUDENT_ID,
        password: process.env.STUDENT_PASSWORD,
        set: process.env.STUDENT_SET,
    });
    const { token, dataUrl } = response.data;
    const dataResponse = await axios.get(`${apiBaseUrl}${dataUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    dataset = dataResponse.data;
    console.log("Dataset B loaded successfully");
    app.listen(PORT, () => {
      connectDB();
      console.log(`Student SET B running on port ${PORT}`);
    });
  } catch (err) {
    console.log("Error loading data:", err.message);
  }
};

startServer();

app.use('/dataset', (req, res) => {
    res.json(dataset);
});
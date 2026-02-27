import express from "express";
import { PORT } from "./config.js";
import { loadDB, recycle } from "./db.js";
import { swaggerSpec, swaggerUi } from "./swagger.js";
import router from "./routes.js";

const app = express();
app.set("trust proxy", true);
app.use(express.json());

// Swagger docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use(router);

// Load DB into cache and start cleanup interval
loadDB();
setInterval(recycle, 60 * 60 * 1000);

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));

export default app;

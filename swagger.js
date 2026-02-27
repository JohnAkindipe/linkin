import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Linkin URL Shortener",
      version: "1.0.0",
      description: "A simple URL shortener API with analytics and auto-expiry.",
    },
  },
  apis: ["./routes.js"],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
export { swaggerUi };

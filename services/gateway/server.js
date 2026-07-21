import "dotenv/config";
import app from "./app.js";
import { connectRedis } from "./src/redis/client.js";

const PORT = process.env.PORT || 8000;

const startServer = async () => {
    try {
        await connectRedis();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`)
        })
    } catch (error) {
        console.error("Failed to start server", error);
        process.exit(1);
    }
}
startServer();
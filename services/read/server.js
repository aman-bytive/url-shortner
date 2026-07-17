import app from "./app.js";
import { connectDB } from "./src/config/db.js";

const startServer = async() =>{
    try{
        await connectDB();
        app.listen(process.env.PORT || 8080,()=>{
            console.log(`Server is running on port ${process.env.PORT || 8080}`)
        })
    }catch(error){
        console.error("Failed to start server",error);
        process.exit(1);
    }
}
startServer();
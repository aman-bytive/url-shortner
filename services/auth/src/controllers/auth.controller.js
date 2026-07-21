import { register,login } from "../services/auth.service.js";
import { responseHandler } from "../utils/response.js";

export const registerUser = async (req, res) => {
    const { email, password } = req.body;

    const result = await register({ email, password });
    
    return responseHandler(result, res, "User registered successfully", 201);
}

export const loginUser = async (req, res) => {
    const { email, password } = req.body;

    const result = await login({ email, password });
    return responseHandler(result, res, "User logged in successfully", 200);
}
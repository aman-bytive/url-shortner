import { register, login, refresh, logout } from "../services/auth.service.js";
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

export const refreshToken = async (req, res) => {
    const { refreshToken } = req.body;

    const result = await refresh({ refreshToken });
    return responseHandler(result, res, "Token refreshed successfully", 200);
}

export const logoutUser = async (req, res) => {
    const {refreshToken} = req.body;

    const result = await logout({refreshToken});
    return responseHandler(result,res,"Logged out successfully",200)
}
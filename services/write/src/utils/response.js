export const responseHandler = (data, res, message, status) => {
    const statusCode = status || 200;
    res.status(statusCode).json({
        data,
        status: statusCode,
        message: message || "Success",
    });
};

export const sendError = (message, res, status) => {
    const statusCode = status || 500;
    res.status(statusCode).json({
        data: null,
        status: statusCode,
        message: message || "Error",
    });
};

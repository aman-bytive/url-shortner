export const errorHandler = (err, req, res, next) => {
    const status = err.isApiError ? err.status : 500;
    const message = err.isApiError ? err.message : "Internal server error";

    if (!err.isApiError) {
        console.error(err);
    }

    res.status(status).json({
        statusCode: status,
        success: false,
        message,
        data: null,
    });
};

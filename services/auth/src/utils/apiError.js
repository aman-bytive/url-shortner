export const createApiError = (message, status = 500) => {
    const error = new Error(message);
    error.status = status;
    error.isApiError = true;
    return error;
};

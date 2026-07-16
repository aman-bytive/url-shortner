import { shortenUrl,getUrlByCode,getAllUrls,softDeleteUrl } from "../services/url.service.js";
import { responseHandler } from "../utils/response.js";

export const createShortUrl = async (req, res) => {
    const { longUrl, customCode, permanent, expiresAt } = req.body;

    const result = await shortenUrl({
        longUrl,
        customCode,
        permanent,
        expiresAt
    });

    return responseHandler(result, res, "Short URL created", 201);
};

export const getShortUrlByCode = async (req, res) => {
    const { shortCode } = req.params;

    const result = await getUrlByCode({shortCode});

    return responseHandler(result,res,"",200);
}

export const getAllShortUrl = async (req,res) =>{
    const {cursor,pageSize} = req.query;
    const result = await getAllUrls({cursor,pageSize});
    return responseHandler(result,res,"",200)
}

export const deleteShortUrl = async(req,res) => {
    const {shortCode} = req.params;
    const result = await softDeleteUrl({shortCode});
    return responseHandler(result,res,"Url deleted",200);
}
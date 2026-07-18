import Joi from "joi";


export const createUrlSchema = Joi.object({
    longUrl : Joi.string().uri().required(),
    customCode : Joi.string().min(3).max(32).pattern(/^[A-Za-z0-9_-]+$/).optional(),
    expiresAt : Joi.date().iso().greater('now').optional(),
    permanent : Joi.boolean().default(false) //false for 302 redirect and true for 301 redirect
})
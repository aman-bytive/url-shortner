import Joi from "joi";


export const createUrlSchema = Joi.object({
    longUrl : Joi.string().uri().required(),
    customCode : Joi.string().optional(),
    expiresAt : Joi.date().iso().optional(),
    permanent : Joi.boolean().default(false) //false for 302 redirect and true for 301 redirect
})
const Joi = require('joi');

const registerValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().min(2).max(50).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        role: Joi.string().valid('USER', 'DRIVER', 'ADMIN').default('USER'),
        phoneNumber: Joi.string().allow('').optional(),
        termsAcceptedAt: Joi.string().optional(),
    });
    return schema.validate(data);
};

const loginValidation = (data) => {
    const schema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required(),
    });
    return schema.validate(data);
};

module.exports = {
    registerValidation,
    loginValidation
};

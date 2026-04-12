const Joi = require('joi');

const registerValidation = (data) => {
    const schema = Joi.object({
        name: Joi.string().min(2).max(50).required().messages({'any.required': 'El nombre es obligatorio.', 'string.empty': 'El nombre no puede estar vacío.'}),
        email: Joi.string().email().required().messages({'any.required': 'El correo electrónico es obligatorio.', 'string.email': 'Ingrese un correo electrónico válido.'}),
        password: Joi.string().min(6).required().messages({'any.required': 'La contraseña es obligatoria.', 'string.min': 'La contraseña debe tener al menos 6 caracteres.'}),
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

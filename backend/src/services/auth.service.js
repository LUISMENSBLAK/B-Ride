const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken } = require('../utils/jwtUtils');

class AuthService {
    async register(userData) {
        const { name, email, password, role, phoneNumber } = userData;

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            throw new Error('User already exists');
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: role || 'USER',
            phoneNumber,
        });

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        return {
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            accessToken,
            refreshToken,
        };
    }

    async login(email, password) {
        // Find user and include password for validation
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            throw new Error('Invalid credentials');
        }

        // Compare password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            throw new Error('Invalid credentials');
        }

        const accessToken = generateAccessToken(user._id);
        const refreshToken = generateRefreshToken(user._id);

        return {
            _id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            accessToken,
            refreshToken,
        };
    }
}

module.exports = new AuthService();

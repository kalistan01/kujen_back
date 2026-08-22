const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Full name is required.'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required.'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/\S+@\S+\.\S+/, "Enter a valid email address."],
    },
    status: {
        type: Boolean,
        default: true
    },
    password: {
        type: String,
        required: [true, 'Password is required.'],
        minlength: [6, 'Password must be at least 6 characters.'],
        select: false 
    },
    roleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Role", 
        required: [true, "Role is required."],
    },
    lastSeen: {
        type: Date,
        default: null,
    },
    lastLoginAt: {
        type: Date,
        default: null,
    },
    lastLoginIp: {
        type: String,
        default: "",
        trim: true,
    },
    lastLoginDevice: {
        type: String,
        default: "",
        trim: true,
    },
    lastLoginUserAgent: {
        type: String,
        default: "",
        trim: true,
    },
    loginDevices: {
        type: [
            {
                device: { type: String, trim: true, default: "" },
                userAgent: { type: String, trim: true, default: "" },
                ip: { type: String, trim: true, default: "" },
                lastLoginAt: { type: Date, default: null },
                lastSeen: { type: Date, default: null },
            },
        ],
        default: [],
    },
}, { timestamps: true });


const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;

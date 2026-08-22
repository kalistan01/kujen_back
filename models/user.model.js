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
}, { timestamps: true });


const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
